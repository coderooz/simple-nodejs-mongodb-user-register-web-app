const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
    },
    phone: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true,
        minlength: 2
        //flaw introduced here for part 2
    },
    created: {
        type: Date,
        required: true,
        default: Date.now

    }
});

module.exports = mongoose.model('users', userSchema);