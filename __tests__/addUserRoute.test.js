const request = require('supertest');

// Mock the Mongoose User model so tests run without a DB connection.
jest.mock('../models/users', () => {
  const UserMock = jest.fn();
  UserMock.findOne = jest.fn();
  return UserMock;
});

const User = require('../models/users');

// Prevent route module from creating real upload middleware / touching disk.
jest.mock('multer', () => {
  const multerMock = () => ({
    single: () => (req, _res, next) => next(),
  });
  multerMock.diskStorage = () => ({});
  return multerMock;
});

const express = require('express');
const session = require('express-session');

function buildApp(extraMiddleware = []) {
  const app = express();

  // Allow tests to run middleware before routes (e.g., to inject req.file).
  for (const mw of extraMiddleware) app.use(mw);

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  // Match main.js session behavior (message written to req.session).
  app.use(
    session({
      secret: 'test-secret',
      saveUninitialized: true,
      resave: false,
    })
  );

  // Mount routes
  app.use('', require('../routes/routes'));
  return app;
}

describe('POST /add (user registration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('success: creates a new user and redirects to /', async () => {
    // Inject req.file BEFORE the routes are mounted.
    const app = buildApp([
      (req, _res, next) => {
        if (req.method === 'POST' && req.path === '/add') {
          req.file = { filename: 'avatar.png' };
        }
        next();
      },
    ]);

    const save = jest.fn().mockResolvedValueOnce(undefined);
    User.mockImplementationOnce(function UserConstructor(doc) {
      this.save = save;
      Object.assign(this, doc);
    });

    const res = await request(app)
      .post('/add')
      .type('form')
      .send({ name: 'Ada', email: 'ada@example.com', phone: '123' });

    expect(User).toHaveBeenCalledTimes(1);
    expect(User).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@example.com',
      phone: '123',
      image: 'avatar.png',
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  test('edge: missing upload file uses default image', async () => {
    const app = buildApp();

    const save = jest.fn().mockResolvedValueOnce(undefined);
    User.mockImplementationOnce(function UserConstructor(doc) {
      this.save = save;
      Object.assign(this, doc);
    });

    const res = await request(app)
      .post('/add')
      .type('form')
      .send({ name: 'Ada', email: 'ada@example.com', phone: '123' });

    expect(User).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@example.com',
      phone: '123',
      image: 'user_unknown.png',
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  test('edge: missing required form fields -> save rejects -> still redirects to /', async () => {
    const app = buildApp();

    const save = jest
      .fn()
      .mockRejectedValueOnce(new Error('Validation failed: name is required'));

    User.mockImplementationOnce(function UserConstructor(doc) {
      this.save = save;
      Object.assign(this, doc);
    });

    const res = await request(app)
      .post('/add')
      .type('form')
      .send({ email: 'ada@example.com', phone: '123' });

    expect(User).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  test('edge: user already exists (current behavior: still creates; improvement would be to check duplicates)', async () => {
    const app = buildApp();

    // Document what a future duplicate-check would look like.
    User.findOne.mockResolvedValueOnce({ _id: 'existing', email: 'ada@example.com' });

    const save = jest.fn().mockResolvedValueOnce(undefined);
    User.mockImplementationOnce(function UserConstructor(doc) {
      this.save = save;
      Object.assign(this, doc);
    });

    const res = await request(app)
      .post('/add')
      .type('form')
      .send({ name: 'Ada', email: 'ada@example.com', phone: '123' });

    // Current route implementation does not call findOne; it always constructs/saves.
    expect(User.findOne).not.toHaveBeenCalled();
    expect(User).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');

    // If you add duplicate checking to the route, flip these expectations:
    // expect(User.findOne).toHaveBeenCalledWith({ email: 'ada@example.com' });
    // expect(User).not.toHaveBeenCalled();
    // expect(save).not.toHaveBeenCalled();
  });
});
