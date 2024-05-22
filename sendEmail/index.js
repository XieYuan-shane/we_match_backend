//引入邮箱发送模块
const nodemailer = require('nodemailer')
const { generateCode } = require('./gencode')
const result = require('@/config/handle')
const { modelCode } = require('@/models/collection')  
const client = require('../routes/redis/index.js'); // 引入Redis客户端实例
let transporter = nodemailer.createTransport({
    host: 'smtp.163.com', // 服务
    port: 465, // smtp端口
    secure: true,
    auth: {
        user: 'wematch_um@163.com', //用户名
        pass: 'ZDOQZMYQEPQJBPOY' // SMTP授权码
    }
});    
// 发送验证码
const verCode = async function (email){

    let code=generateCode()
    try{
        const res = await transporter.sendMail({
        from: 'wematch_um@163.com', // 发件邮箱
        to: email, // 收件列表
        subject: 'We_Match', // 标题
        html: `
        <div style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; color: #333;">
        <h2 style="color: #4A90E2;">We_Match 验证码</h2>
        <p>亲爱的用户，您好！</p>
        <p>您正在注册/登录 <strong>We_Match</strong> 账号。请在表单中输入以下验证码：</p>
        <div style="background-color: #F8F8F8; text-align: center; padding: 20px; margin: 20px 0;">
            <span style="font-size: 20px; font-weight: bold; color: #E9573F;">${code}</span>
        </div>
        <p>请注意：该验证码将在 <strong>5分钟</strong> 后失效。</p>
        <p>如果您没有尝试注册/登录We_Match账号，请忽略此邮件。</p>
        <hr style="border: none; border-bottom: 1px solid #EEE;">
        <p style="font-size: 12px; color: #999;">这是一封自动发送的邮件，请不要直接回复。</p>
    </div> ` // html 内容    
    })
        // 使用 setex 方法存储验证码到 Redis，并设置过期时间为 5 分钟（300秒）
        await client.setEx(email, 300, code);
        return res
    }
      catch (error) {
        throw new result('发送验证码失败', 500, error)
    }  
}

// 验证验证码是否正确
const queryCode = async function (email,code) {
    const res = await client.get(email);
    if(res === code){
        return 'SUCCESS'
    }
    else{
        throw { message: '验证码不正确', code: 422 }
    }
};
module.exports = {
    verCode,
    queryCode
}