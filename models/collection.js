// 第一步
const mongoose = require('mongoose')
mongoose.pluralize(null)//去掉集合后面的s
const { Schema, model } = mongoose
const versionKey = { versionKey: false }
const moment = require('moment')
moment.locale('zh-cn')

/**
 * 这个是小程序端的表
 */

// 1. 用户账户表
const UserSchema = new Schema({
    email: {//邮箱号
        type: String,
        unique: true,//唯一性
        trim: true,//去掉空格
    },
    password: {//密码
        type: String,
        select: false,//私密，不会返回给前端
        default: ''//默认值
    },
    uid: {//唯一标识
        type: String,
        unique: true,//唯一性
        default: () => new Date().getTime()
    },
    avatarUrl: {//头像
        type: String,
        default: 'https://diancan-1252107261.cos.accelerate.myqcloud.com/lvyou/avatarurl.png'
    },
    nickname: {//昵称
        type: String,
        default: '用户',
        trim: true,//去掉空格
    },
    gender: {//性别
        type: String,
        default: '男'
    },
    birthday: {//生日
        type: String,
        default: ''
    },
    age: {//年龄
        type: String,
        default: ''
    },
    college: {//居住的书院
        type: String,
        default: ''
    },
    backdrop: {//背景
        type: String,
        default: 'https://diancan-1252107261.cos.accelerate.myqcloud.com/lvyou/user-backdrop.jpg'
    },
    my_tags: {//用户兴趣文章标签
        type: Array,
        default: []
    },
    deleted:{
        type: String,
        default: ""
    }
}, versionKey)

// 2. 用户发表的文章
const ArticleSchema = new Schema({
    author_uid: String,//文章作者uid
    author_id: { type: mongoose.Types.ObjectId, ref: 'user', required: true },//关联用户表
    title: {//文章标题
        type: String,
        trim: true
    },
    content: String,//文章内容
    cover_image: {//封面图
        url: String,
        width: Number,
        height: Number
    },
    image: {//图片的合集
        type: Array,
        default: [],
    },
    videoUrl: {//短视频的链接
        url: {
            type: String,
            default: ''
        },
        width: {
            type: Number,
            default: 0
        },
        height: {
            type: Number,
            default: 0
        }
    },
    fileType: {//判断文件类型：image:'图片'；video:视频
        type: String,
        default: 'image'
    },
    
    address: String,//详细地址
    category:{
        type:String,
        default:""
    },
    tag: {//标签
        type: Array,
        default: []
    },
    time: {//发表时间article
        type: String,
        default: () => moment().utcOffset(8).format('YYYY-MM-DD')
    },
    time_stamp: {//发表时间戳
        type: Number,
        default: () => moment().unix()
    }
}, versionKey)



// 3. 点赞表
const LikeSchema = new Schema({
    user_uid: String,//点赞用户uid
    author_uid: String,//作者uid
    user_id: {//关联用户表
        type: mongoose.Types.ObjectId,
        ref: 'user',
        required: true
    },
    article_id: {//关联文章表
        type: mongoose.Types.ObjectId,
        ref: 'userarticle',
        required: true
    }
}, versionKey)

// 4. 收藏表
const CollectionSchema = new Schema({
    user_uid: String,//收藏用户uid
    author_uid: String,//作者uid
    user_id: {//关联用户表
        type: mongoose.Types.ObjectId,
        ref: 'user',
        required: true
    },
    article_id: {//关联文章表
        type: mongoose.Types.ObjectId,
        ref: 'userarticle',
        required: true
    },
    time: {
        type: String,
        default: () => moment().utcOffset(8).format('YYYY-MM-DD')
    }
}, versionKey)

// 5. 评论表
const CommentSchema = new Schema({
    user_uid: String,//收藏用户uid
    author_uid: String,//作者uid
    user_id: {//关联用户表
        type: mongoose.Types.ObjectId,
        ref: 'user',
        required: true
    },
    article_id: {//关联文章表
        type: mongoose.Types.ObjectId,
        ref: 'userarticle',
        required: true
    },
    time: {
        type: String,
        default: () => moment().utcOffset(8).format('YYYY-MM-DD')
    },
    content: {//评论内容
        type: String,
        trim: true
    }
}, versionKey)

// 6. 关注表
const ConcernSchema = new Schema({
    user_uid: String,//A关注B，A用户的uid
    im_concerned_uid: String//A关注B，B用户的uid
}, versionKey)



// 7. 发起结伴表
const CompanionSchema = new Schema({
    uid: String,//发起人的uid
    description: String,//描述
    image: Array,//图片合集
    full_address: String,//目的地详细地址
    companion_time: String,//结伴时间
    companion_timestamp: Number,//结伴时间时间戳
    number_of_people: Number,//希望人数
    category: String,//分类
    article_id: String,//活动的id
    blackList:[],
    time: {//提交时间
        type: String,
        default: () => moment().utcOffset(8).format('YYYY-MM-DD')
    },
    timestamp: {//提交时间时间戳
        type: Number,
        default: () => moment().unix()
    }
}, versionKey)

// 8. 结伴报名表
const SignupSchema = new Schema({
    signup_id: {//关联发起结伴表
        type: mongoose.Types.ObjectId,
        ref: 'companion',
        required: true
    },
    user_uid: String,//报名用户uid
    contact_inform: String,//联系方式
    gender: Number,//性别,0:女，1：男
    introduce: String,//自我介绍
    time: {//提交时间
        type: String,
        default: () => moment().utcOffset(8).format('YYYY-MM-DD')
    },
    timestamp: {//提交时间时间戳
        type: Number,
        default: () => moment().unix()
    }
}, versionKey)


// 9. 聊天记录私聊表（2个人）
const privateMessageSchema = new Schema({
    participantA: String,
    participantB:String,
    nickNameA: String,
    nickNameB:String,
    avatarUrlA:String,
    avatarUrlB:String,
    messages: [{
        sender: String, //发送者的id
        content: String,
        time: String//发送时间
      }]
  }, versionKey);
//10. 群组聊天表
const groupMessageSchema = new Schema({
    // MongoDB会自动生成_id，可以作为groupId使用
    activityId: String,
    participants: [{type:String}],
    messages: [{
        senderId:String,
        content: String,
        createdAt: String
    }]
}, versionKey);

//11. 每个用户推荐前十的表
const recommendList = new Schema({
    //用户id
    userId: String,
    recommendListId: [],
    recommendScore:[]
}, versionKey);

// 第三步
module.exports = {
    modelCode: model('code', Code),
    modelUser: model('user', UserSchema),
    modelArticle: model('userArticle', ArticleSchema),
    modelLike: model('like', LikeSchema),
    modelCollection: model('collection', CollectionSchema),
    modelComment: model('comment', CommentSchema),
    modelConcern: model('concern', ConcernSchema),
    modelCompanion: model('companion', CompanionSchema),
    modelSignup: model('signup', SignupSchema),
    modelChatPrivate:model("privateMessage",privateMessageSchema),
    modelChatGroup:model("groupChatMessage",groupMessageSchema),
    modelRecommendation: model('recommendation',recommendList)
}