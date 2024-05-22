// 捕获错误的中间件
const result = require('./handle')

const errorHandler = async (ctx, next) => {
    try {
        await next()
    } catch (error) {
        console.log('出错');
        console.log(error.message);
        const isres = error instanceof result
        if (isres) {//调用result类，已知错误
            ctx.body = {
                msg: error.msg,
                error: error.error
            }
            ctx.status = error.code
        } else {//异常的未知错误
            ctx.body = {
                msg: '服务器的异常错误',
                error: error.message
            }
            ctx.status = 500
        }
    }
}

module.exports = errorHandler