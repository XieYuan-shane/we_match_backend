const router = require('@koa/router')()
const { modelUser } = require('@/models/collection')
const {
    Login,
    Vercode,
    Emailregistration,
    Uploadpassword,
    Modifytheuser
} = require('@/config/valiData')
const { verCode, queryCode } = require('@/sendEmail/index')
const { gentoken } = require('@/token/jwt')
const { Auth } = require('@/token/auth')
const crypto = require('crypto')
const moment = require('moment')
moment.locale('zh-cn')

// 小程序端：发送验证码
router.get('/vercode', async ctx => {
    const { emailAddress } = ctx.query
    // 校验
    Vercode(emailAddress)
    const res = await verCode(emailAddress)
    if (res.rejected.length === 0) {
        ctx.send('SUCCESS', 200, { message: '发送成功' })
    } else {
        ctx.send('ERROR',422, { message: '发送失败' })
    }
})
//创建测试账号
//router.post('/registrationRoot', async ctx => {
//const { email, nickname,password } = ctx.request.body
// 创建哈希对象
       // const hash = crypto.createHash('sha256').update(password)
        // 生成哈希值//123456we
        //const passwordHash = hash.digest('hex')
//await modelUser.create({ email, nickname,password: passwordHash})
//console.log("创建成功")
//ctx.send('SUCCESS', 200)
//})


// 小程序端：邮箱，验证码登录
router.post('/email-registration', async ctx => {
    const { email, code } = ctx.request.body
    //校验数据
    Emailregistration(email, code)
    // 验证验证码是否正确
    await queryCode(email,code)
    //判断用户之前是否已有账号
    const res = await modelUser.find({ email }, { email: false, my_tags: false }).lean()
    if (res.length > 0) {//已有账号
        if(res[0].deleted === "1"){
            ctx.send('账号已删除，不能登录', 403)
            return;
        }
        const token = { user_Token: gentoken(res[0].uid) }
        ctx.send('SUCCESS', 200, { ...res[0], ...token })
    } else {//没有账号
        const atPosition = email.indexOf('@'); // 找到'@'符号在邮箱中的位置
        const nickname = '用户_' + email.substring(atPosition - 4, atPosition); // 截取'@'符号前的4位字符
        await modelUser.create({ email, nickname })
        const userData = await modelUser.find({ email }, { email: false, my_tags: false }).lean()
        const token = { user_Token: gentoken(userData[0].uid) }
        ctx.send('SUCCESS', 200, { ...userData[0], ...token })
    }
})

// 设置密码，修改密码
router.post('/upload-password', async ctx => {
    const { email, code, password } = ctx.request.body
    Uploadpassword(email, code, password)
    // 验证验证码是否正确
    await queryCode(email, code)
    // 判断用户是否存在
    const res = await modelUser.find({ email }).lean()
    if (res.length > 0) {//用户信息存在
        // 创建哈希对象
        const hash = crypto.createHash('sha256').update(password)
        // 生成哈希值//123456we
        const passwordHash = hash.digest('hex')
        await modelUser.findOneAndUpdate({ email }, { password: passwordHash })
        ctx.send()
    } else {//用户信息不存在
        ctx.send('账号不存在', 422)
    }
})

// 小程序端，手机号和密码登录
router.post('/login', async ctx => {
    const { email, password } = ctx.request.body
    Login(email, password)
    // 创建哈希对象
    const hash = crypto.createHash('sha256').update(password)
    // 生成哈希值//123456we
    const passwordHash = hash.digest('hex')
    const res = await modelUser.find({ email, password: passwordHash,deleted: { $ne: "1" } }, { email: false, my_tags: false }).lean()
    if (res.length > 0) {
        const token = { user_Token: gentoken(res[0].uid) }
        ctx.send('SUCCESS', 200, { ...res[0], ...token })
    } else {
        ctx.send('账号或密码错误', 422)
    }
})

// 编辑个人资料
router.post('/modify-the-user', new Auth().m, async ctx => {
    const { nickname, gender, birthday, college, avatarUrl, backdrop } = ctx.request.body
    Modifytheuser(nickname, gender, birthday, college, avatarUrl, backdrop)
    // 计算年龄
    const age = moment().diff(moment(birthday, 'YYYY-MM-DD'), 'years')
    const res = await modelUser.findOneAndUpdate({ uid: ctx.auth.uid },
        { nickname, gender, birthday, college, avatarUrl, backdrop, age },
        { new: true, select: 'nickname gender birthday college avatarUrl backdrop age' }
    )
    ctx.send('SUSSECC', 200, res)
})
//获取头像等信息
router.get('/myInformation',new Auth().m,async ctx => {
    const userId = ctx.auth.uid;
    const res = await modelUser.findOne({ uid: ctx.auth.uid },
        {uid:1,avatarUrl:1,nickname:1})
        ctx.send('SUCCESS', 200, res)    
    }
)

module.exports = router.routes()