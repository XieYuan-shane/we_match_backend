const jwt = require('jsonwebtoken')
const { secretkey, expiresIn } = require('./tokentime').security

// 生成token
function gentoken(uid, scope = 'admin') {
    return jwt.sign({ uid, scope }, secretkey, { expiresIn })
}

module.exports = { gentoken }