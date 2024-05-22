// 参数校验，捕获已知错误
class result extends Error {
    constructor(msg, code, error = null) {
        super()
        this.msg = msg
        this.code = code
        this.error = error
    }
}

module.exports = result