const router = require('@koa/router')()
const mongoose = require('mongoose')
//接口
const {
    modelAdministrator,
    modelDailyrecom,
    modelFourArticle
} = require('@/models/collection-pc')
//实体类
const {
    modelUser,
    modelArticle,
    modelConcern
} = require('@/models/collection')
const {
    Adminregister,
    ModifyuserInfor,
    Dailyrecom,
    Resreturn,
    CompanionDetails,
    Uploadfourarticle,
    Modifyfourarticle,
    Searcharticle
} = require('@/config/valiData')
const { Auth } = require('@/token/auth')
const crypto = require('crypto')
const { gentoken } = require('@/token/jwt')
const moment = require('moment')
moment.locale('zh-cn')
const { upload, cosUpdate } = require('@/cos/cos')
const fs = require('fs')
const { looKup, looKupRecommend } = require('@/config/lookup')

// 注册管理员账号
router.post('/adminRegister', async ctx => {
    const { mobile, password } = ctx.request.body
    Adminregister(mobile, password)
    const res = await modelAdministrator.find({ mobile }).lean()
    if (res.length > 0) {
        ctx.send('账号已经存在', 422)
    } else {
        // 创建哈希对象
        const hash = crypto.createHash('sha256').update(password)
        // 生成哈希值//123456we
        const passwordHash = hash.digest('hex')
        await modelAdministrator.create({ mobile, password: passwordHash })
        ctx.send('注册成功', 200)
    }
})

// 登录
router.post('/adminLogin', async ctx => {
    const { mobile, password } = ctx.request.body
    Adminregister(mobile, password)
    // 创建哈希对象
    const hash = crypto.createHash('sha256').update(password)
    // 生成哈希值//123456we
    const passwordHash = hash.digest('hex')
    const res = await modelAdministrator.find({
        mobile, password: passwordHash
    },
        { mobile: false }
    ).lean()
    if (res.length > 0) {
        const token = { user_Token: gentoken(res[0].admin_uid) }
        ctx.send('SUCCESS', 200, { ...res[0], ...token })
    } else {
        ctx.send('账号或者密码错误', 422)
    }
})

// 图片上传,array为多图上传，第二个为一次性可以最多多少张，前端设置为6张
router.post('/imageUpload', upload.array('file', 6), async ctx => {
    
    const res = await cosUpdate(ctx.files)

    ctx.send('SUCCESS', 200, res)
})

// 更新管理员头像，昵称
router.post('/modifyUserInfor', new Auth().m, async ctx => {
    const { _id, avatarUrl, nickname } = ctx.request.body
    ModifyuserInfor(_id, avatarUrl, nickname)
    await modelAdministrator.findByIdAndUpdate({ _id }, {
        avatarUrl, nickname
    })
    ctx.send()
})

// 上传每日推荐
router.post('/dailyRecom', new Auth().m, async ctx => {
    //这个颜色是搜索框的颜色
    const { imageUrl, title, address, color } = ctx.request.body
    Dailyrecom(imageUrl, title, address, color)
    await modelDailyrecom.create({ imageUrl, title, address, color })
    ctx.send()
})

// 获取每日推荐
router.get('/gainDailyRecom', new Auth().m, async ctx => {
    const { page } = ctx.query
    Resreturn(page)
    //按照时间戳倒叙查询
    const res = await modelDailyrecom.find({}, { timestamp: false })
        .sort({ timestamp: -1 })
        .skip((page - 1) * 6)
        .limit(6)//一次查询六条
    // 获取数据总条数
    const count = await modelDailyrecom.countDocuments()
    const resData = { data: res, count }
    ctx.send('SUCCESS', 200, resData)
})

// 删除每日推荐
router.get('/deleteDailyRecom', new Auth().m, async ctx => {
    const { _id } = ctx.query
    CompanionDetails(_id)
    await modelDailyrecom.deleteMany({ _id })
    ctx.send()
})

// 获取所有用户的文章：用作关联推荐（用于后端提交到用于推荐的文章）
router.get('/allUserArticle', new Auth().m, async ctx => {
    const { page } = ctx.query
    Resreturn(page)
    const res = await modelArticle.aggregate([
        { $sort: { time_stamp: -1 } },//按创建时间倒序查询
        { $skip: (page - 1) * 10 },
        { $limit: 10 },//一次取10条
        //这里定义了公用连表查询
        looKup().model_user,//关联用户表
        {
            $project: {
                //这里下面表示的是要返回的数据
                "_id": 1,
                "title": 1,
                "address": 1,
                "time": 1, //发布时间
                "author_data.nickname": 1
            }
        }
    ])
    // 获取文章总条数
    const count = await modelArticle.countDocuments()
    const resObj = { data: res, count }
    ctx.send('SUCCESS', 200, resObj)
})

// 提交四个推荐(这里是后台操作)
router.post('/uploadFourArticle', new Auth().m, async ctx => {
    const { imageUrl, article_id } = ctx.request.body
    Uploadfourarticle(imageUrl, article_id)
    await modelFourArticle.create({ imageUrl, article_id })
    ctx.send()
})

// 获取四个推荐文章
router.get('/gainRecomArticle', new Auth().m, async ctx => {
    const res = await modelFourArticle.aggregate([
        { $sort: { timestamp: -1 } },
        looKupRecommend().model_Article,
        looKupRecommend().model_reco_user,
        { $unwind: '$articleData' },
        { $unwind: '$userData' },
        {
            $project: {
                "_id": 1,//用户id
                "imageUrl": 1,//封面图
                "time": 1,//后台发布时间
                "article_id": 1,//文章id
                "fileType":"$articleData.fileType",//文章类型，是图片还是vedio
                "articltTime": "$articleData.time",//文章发表时间
                "nickname": "$userData.nickname"//作者昵称
            }
        }
    ])
    console.log(JSON.stringify(res));
    ctx.send('SUCCESS', 200, res)
})

// 修改更新四个文章
router.post('/modifyRecomArticle', new Auth().m, async ctx => {
    const { _id, imageUrl, article_id } = ctx.request.body
    Modifyfourarticle(_id, imageUrl, article_id)
    await modelFourArticle.findByIdAndUpdate({ _id },
        { imageUrl, article_id })
    ctx.send()
})

// 删除四个推荐文章
router.get('/deleteRecomArticle', new Auth().m, async ctx => {
    const { _id } = ctx.query
    CompanionDetails(_id)
    await modelFourArticle.deleteMany({ _id })
    ctx.send()
})

// 文章管理：获取全部文章
router.get('/articleManaGement', new Auth().m, async ctx => {
    const { page } = ctx.query
    Resreturn(page)
    const res = await modelArticle.aggregate([
        { $sort: { time_stamp: -1 } },//按创建时间倒序查询
        { $skip: (page - 1) * 10 },
        { $limit: 10 },
        looKup().model_user,
        {
            $project: {
                _id: 1,
                title: 1,
                content: 1,
                image: 1,
                videoUrl: 1,
                fileType: 1,
                address: 1,
                time: 1,
                cover_image: 1,
                "author_data.avatarUrl": 1,
                "author_data.nickname": 1,
            }
        }
    ])
    const count = await modelArticle.countDocuments()
    const resObj = { data: res, count }
    ctx.send('SUCCESS', 200, resObj)
})

// 用户管理：获取所有用户信息
router.get('/allUserInfor', new Auth().m, async ctx => {
    const { page } = ctx.query
    Resreturn(page)
    const res = await modelUser.aggregate([
        { $skip: (page - 1) * 10 },
        { $limit: 10 },
        {
            $lookup: {//关联文章表，获取文章总数
                from: modelArticle.collection.name,
                localField: 'uid',
                foreignField: 'author_uid',
                as: 'articleQuantity'
            }
        },
        {
            $lookup: {//关联关注表，获取粉丝数
                from: modelConcern.collection.name,
                localField: 'uid',
                foreignField: 'im_concerned_uid',
                as: 'concernQuantity'
            }
        },
        {
            $project: {
                _id: 1,
                avatarUrl: 1,
                nickname: 1,
                uid: 1,
                email: 1,
                //计算粉丝数量
                "concernQuantity": { $size: "$concernQuantity" },
                //计算发表文章数量
                "articleQuantity": { $size: "$articleQuantity" },
            }
        }
    ])
    const count = await modelUser.countDocuments()
    const resObj = { data: res, count }
    ctx.send('SUCCESS', 200, resObj)
})

//删除一些违规文章
router.post('/deleteArticle', new Auth().m,async ctx => {
    const {_id} = ctx.request.body
    CompanionDetails(_id)
    try {  
        // await modelArticle.findByIdAndDelete(_id);
        ctx.send('文章删除成功', 200);
    } catch (error) {
        ctx.send('删除失败', 500);
    }
})
// 标记用户为已删除
router.post('/deleteUser', new Auth().m, async ctx => {
    const { userId } = ctx.request.body;
    try {
        // 更新用户的deleted标记为"1"
        await modelUser.findByIdAndUpdate(userId, { deleted: "1" });
        ctx.send('用户标记为已删除成功', 200);
    } catch (error) {
        ctx.send('操作失败', 500);
    }
})

module.exports = router.routes()