const request = require('supertest');
const express = require('express');
const session = require('express-session');
const path = require('path');

// Mock multer before loading the router so diskStorage and .single() are no-ops
jest.mock('multer', () => {
    const multerMock = jest.fn().mockReturnValue({
        single: jest.fn().mockReturnValue((req, res, next) => {
            req.file = null;
            next();
        })
    });
    multerMock.diskStorage = jest.fn().mockReturnValue({});
    return multerMock;
});

// Mock the User mongoose model before loading the router
jest.mock('../models/users');
const User = require('../models/users');

function buildApp() {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    app.use(session({ secret: 'test-secret', saveUninitialized: true, resave: false }));
    app.use((req, res, next) => {
        res.locals.message = req.session.message;
        delete req.session.message;
        next();
    });
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '../views'));
    app.use('', require('../routes/routes'));
    return app;
}

describe('POST /add - Add User', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = buildApp();
    });

    test('creates a new user and redirects to / on success', async () => {
        const mockSave = jest.fn().mockResolvedValue({});
        User.mockImplementation(() => ({ save: mockSave }));

        const res = await request(app)
            .post('/add')
            .type('form')
            .send({ name: 'John Doe', email: 'john@example.com', phone: '5551234567' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/');
        expect(User).toHaveBeenCalledWith({
            name: 'John Doe',
            email: 'john@example.com',
            phone: '5551234567',
            image: 'user_unknown.png'
        });
        expect(mockSave).toHaveBeenCalledTimes(1);
    });

    test('uses "user_unknown.png" as default image when no file is uploaded', async () => {
        const mockSave = jest.fn().mockResolvedValue({});
        User.mockImplementation(() => ({ save: mockSave }));

        await request(app)
            .post('/add')
            .type('form')
            .send({ name: 'Jane Doe', email: 'jane@example.com', phone: '5559876543' });

        const constructorArg = User.mock.calls[0][0];
        expect(constructorArg.image).toBe('user_unknown.png');
    });

    test('still redirects to / when save throws a database error', async () => {
        const mockSave = jest.fn().mockRejectedValue(new Error('DB connection failed'));
        User.mockImplementation(() => ({ save: mockSave }));

        const res = await request(app)
            .post('/add')
            .type('form')
            .send({ name: 'Test User', email: 'test@example.com', phone: '0000000000' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/');
    });

    test('still redirects to / when required fields are missing (validation error)', async () => {
        const validationError = new Error(
            'users validation failed: name: Path `name` is required.'
        );
        const mockSave = jest.fn().mockRejectedValue(validationError);
        User.mockImplementation(() => ({ save: mockSave }));

        const res = await request(app)
            .post('/add')
            .type('form')
            .send({ email: 'noname@example.com', phone: '1111111111' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/');
    });
});
