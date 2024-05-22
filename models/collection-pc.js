const mongoose = require('mongoose')
mongoose.pluralize(null)//去掉集合后面的s
const { Schema, model } = mongoose
const versionKey = { versionKey: false }
const moment = require('moment')
moment.locale('zh-cn')

/**
 * 这个是后端用的数据实体表
 */


// 管理员账号
const AdminSchema = new Schema({
    mobile: {//手机号
        type: String,
        unique: true,
        trim: true
    },
    password: {//密码
        type: String,
        trim: true,
        select: false,//私密，不会返回给前端
    },
    admin_uid: {//uid
        type: String,
        unique: true,
        default: () => new Date().getTime()
    },
    avatarUrl: {//头像·
        type: String,
        default: 'https://diancan-1252107261.cos.accelerate.myqcloud.com/lvyou/avatarurl.png'
    },
    nickname: {//昵称
        type: String,
        default: '用户admin',
        trim: true
    }
}, versionKey)

// 每日推荐
const DailyrecomSchema = new Schema({
    imageUrl: String,//封面图
    title: String,//标题
    address: String,//地址
    color: String,//输入框的背景颜色
    time: {
        type: String,
        default: () => moment().utcOffset(8).format('YYYY-MM-DD')
    },
    //时间戳
    timestamp: {
        type: Number,
        default: () => moment().unix()
    }
}, versionKey)


// 四个推荐表
const FourArticleSchema = new Schema({
    imageUrl: String,//封面图
    article_id: {//关联文章表的_id
        type: mongoose.Types.ObjectId,
        ref: 'userarticle',
        require: true
    },
    time: {
        type: String,
        default: () => moment().utcOffset(8).format('YYYY-MM-DD')
    },
    timestamp: {
        type: Number,
        default: () => moment().unix()
    }
}, versionKey)

module.exports = {
    modelAdministrator: model("administrator", AdminSchema),
    modelDailyrecom: model("dailyrecom", DailyrecomSchema),
    modelFourArticle: model('fourArticle', FourArticleSchema)
}