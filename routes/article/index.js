const router = require('@koa/router')()
const {
    modelArticle,
    modelUser,
    modelLike,
    modelCollection,
    modelComment,
    modelConcern
} = require('@/models/collection')
const {
    Articlekeyword,
    Articlepblish,
    ArticlepblishVideo,
    CompanionDetails,
    Comment,
    Commentget,
    Userconcern,
    Resreturn
} = require('@/config/valiData')
const { Auth } = require('@/token/auth')
const { Authuid } = require('@/token/auth_uid')
// 百度ai关键词提取
const aiKeyword = require('@/aikeyword/index')
const moment = require('moment')
moment.locale('zh-cn')
// 计算图片宽高
const imageInfor = require('@/config/image-info')
const mongoose = require('mongoose')
const { looKup, looKupConcern } = require('@/config/lookup')
const client = require('../redis/index.js'); // 引入Redis客户端实例
moment.updateLocale('zh-cn', {
    relativeTime: {
        future: '%s内',
        past: '%s前',
        s: '刚刚',
        ss: '%d秒前',
        m: '1分钟',
        mm: '%d分钟',
        h: '1小时',
        hh: '%d小时',
        d: '1天',
        dd: '%d天',
        w: '1周',
        ww: '%d周',
        M: '1个月',
        MM: '%d个月',
        y: '1年',
        yy: '%d年'
    },
});

// 分析活动分享的关键词
router.post('/article-keyword',new Auth().m, async ctx => {
    const { text } = ctx.request.body
    Articlekeyword(text)
    if (text.trim() === '') {
        ctx.send('SUCCESS', 200, [])
        return false
    }
    const res = await aiKeyword(text)
    const aitext = res.map((item => { return item.word }))
    const newarr = [ ...aitext]
    ctx.send('SUCCESS', 200, newarr)
})

// 发布:图片类型new Auth().m,
router.post('/article-publish', new Auth().m, async ctx => {
    const { title, content, image, address,tag,category } = ctx.request.body

    Articlepblish(title, content, image,address,tag,category)
    // 获取封面图的宽高
    const imageUrl = await imageInfor(image[0])
    const userUid = await modelUser.find({ uid: ctx.auth.uid }, { _id: true }).lean()
    const saveRes = await modelArticle.create({
        author_uid: ctx.auth.uid,
        author_id: userUid[0]._id,
        title, content,
        cover_image: {
            url: image[0],
            width: imageUrl.width,
            height: imageUrl.height
        },
        image, address, category
    })

    modelArticle.findOneAndUpdate({ _id: saveRes._id },
        { '$addToSet': { tag: { '$each': tag } } })
    // 更新用户标签
    modelUser.findOneAndUpdate({ _id: userUid[0]._id },
        { '$addToSet': { my_tags: { '$each': tag } } })
    ctx.send()
})

// 发布文章:视频类型new Auth().m,
router.post('/article-publish-Video', new Auth().m, async ctx => {
    const { title, content,  address, category,
        tag, videoPoster, videoUrl, videoWidth, videoHeight } = ctx.request.body
    ArticlepblishVideo(title, content,  address, category,
        tag, videoPoster, videoUrl, videoWidth, videoHeight)
    // 获取封面图的宽高
    const imageUrl = await imageInfor(videoPoster)
    const userUid = await modelUser.find({ uid: ctx.auth.uid }, { _id: true }).lean()
    const saveRes = await modelArticle.create({
        author_uid: ctx.auth.uid,
        author_id: userUid[0]._id,
        title, content,
        cover_image: {
            url: videoPoster,
            width: imageUrl.width,
            height: imageUrl.height
        },
        address, category,
        videoUrl: {
            url: videoUrl,
            width: videoWidth,
            height: videoHeight
        },
        fileType: 'video'
    })
    await modelArticle.findOneAndUpdate({ _id: saveRes._id },
        { '$addToSet': { tag: { '$each': tag } } })
     ctx.send()
    // 更新用户标签
    await modelUser.findOneAndUpdate({ _id: userUid[0]._id },
        { '$addToSet': { my_tags: { '$each': tag } } })
})

// 用户给点赞（相当于创建一个数据）
router.get('/user-like', new Auth().m, async ctx => {
    const { article_id } = ctx.query
    const interactionsKey = `article:${article_id}:interactions`;
    CompanionDetails(article_id)
    // 查询是否点过赞
    const exist = await modelLike.find(
        { article_id, user_uid: ctx.auth.uid })
    if (exist.length <= 0) {
        // 查询文章表的作者uid
        const authorUid = await modelArticle.find(
            { _id: article_id }, { author_uid: true }).lean()
        // 查询用户表的uid
        const userUid = await modelUser.find(
            { uid: ctx.auth.uid }, { _id: true }).lean()
        await modelLike.create({
            user_uid: ctx.auth.uid,
            author_uid: authorUid[0].author_uid,
            user_id: userUid[0]._id,
            article_id
        })
        // 使用 HINCRBY 命令增加 hash 中的 "likes" 字段
        client.hIncrBy(interactionsKey, "likes", 1);
        ctx.send()
        // 用户对该篇文章感兴趣，那就更新用户标签
        const tagData = await modelArticle.find({ _id: article_id },
            { tag: true }
        )
        // 更新用户标签
        await modelUser.findOneAndUpdate({ uid: ctx.auth.uid },
            { '$addToSet': { my_tags: { '$each': tagData[0].tag } } })
    } else {
        ctx.send()
    }
})

// 取消点赞
router.get('/cancel-like', new Auth().m, async ctx => {
    const { article_id } = ctx.query
    CompanionDetails(article_id)
    const interactionsKey = `article:${article_id}:interactions`;
    const res = await modelLike.deleteMany(
        { user_uid: ctx.auth.uid, article_id })
    if (res.deletedCount > 0) {
        client.hIncrBy(interactionsKey, "likes", -1);
        ctx.send()
    } else {
        ctx.send('取消点赞失败', 422)
    }
})

// 用户收藏
router.get('/collect-article', new Auth().m, async ctx => {
    const { article_id } = ctx.query
    CompanionDetails(article_id)
    const interactionsKey = `article:${article_id}:interactions`;
    // 查询是否收藏过
    const exist = await modelCollection.find(
        { article_id, user_uid: ctx.auth.uid })
    if (exist.length <= 0) {
        // 查询文章表的作者uid
        const authorUid = await modelArticle.find(
            { _id: article_id }, { author_uid: true }).lean()
        // 查询用户表的uid
        const userUid = await modelUser.find(
            { uid: ctx.auth.uid }, { _id: true }).lean()
        await modelCollection.create({
            user_uid: ctx.auth.uid,
            author_uid: authorUid[0].author_uid,
            user_id: userUid[0]._id,
            article_id
        })
        client.hIncrBy(interactionsKey, "collections", 1);
        ctx.send()
        // 用户对该篇文章感兴趣，那就更新用户标签
        const tagData = await modelArticle.find({ _id: article_id },
            { tag: true }
        )
        // 更新用户标签
        await modelUser.findOneAndUpdate({ uid: ctx.auth.uid },
            { '$addToSet': { my_tags: { '$each': tagData[0].tag } } })
    } else {
        ctx.send()
    }
})

// 取消收藏
router.get('/cancel-collection', new Auth().m, async ctx => {
    const { article_id } = ctx.query
    CompanionDetails(article_id)
    const interactionsKey = `article:${article_id}:interactions`;
    const res = await modelCollection.deleteMany(
        { user_uid: ctx.auth.uid, article_id })
    if (res.deletedCount > 0) {
        client.hIncrBy(interactionsKey, "lcollections", -1);
        ctx.send()
    } else {
        ctx.send('取消收藏失败', 422)
    }
})

// 用户评论
router.post('/comment-article', new Auth().m, async ctx => {
    const { article_id, comment_content } = ctx.request.body
    Comment(article_id, comment_content)
    // 查询文章表的作者uid
    const authorUid = await modelArticle.find(
        { _id: article_id }, { author_uid: true }).lean()
    // 查询用户表的uid
    const userUid = await modelUser.find(
        { uid: ctx.auth.uid }).lean()
    const res = await modelComment.create({
        user_uid: ctx.auth.uid,
        author_uid: authorUid[0].author_uid,
        user_id: userUid[0]._id,
        article_id,
        content: comment_content
    })
    const resObj = {
        _id: res._id, //评论id
        article_id,//文章id
        content: comment_content,//评论内容
        time: res.time, //评论时间
        user_uid: ctx.auth.uid, //用户id
        comment_user: [{ //评论用户
            avatarUrl: userUid[0].avatarUrl, //评论用户的id和昵称
            nickname: userUid[0].nickname
        }],
        isComment_user: true //是否为评论对象
    }
    ctx.send('SUCCESS', 200, resObj)
})

// 删除评论
router.get('/comments-delete', new Auth().m, async ctx => {
    const { comment_id } = ctx.query
    CompanionDetails(comment_id)
    // 判断是否是该用户的评论
    const res = await modelComment.find(
        { _id: comment_id, user_uid: ctx.auth.uid })
    if (res.length <= 0) {
        ctx.send('SUCCESS', 422, { message: '评论不存在或者不能删除别人的评论' })
        return false
    }
    await modelComment.findByIdAndDelete({ _id: comment_id })
    ctx.send()
})

// 获取的评论数据：需要考虑用户在登录的情况下是可以删除评论的
//new Authuid().m这个组件获取到了当前登录用户的uid
router.get('/comments-data', new Authuid().m, async ctx => {
    const { article_id, page } = ctx.query
    Commentget(article_id, page)
    const myUid = ctx.auth.uid ? ctx.auth.uid : 'm1'
    //分页查询，与用户表连接，返回6条project数据
    const res = await modelComment.aggregate([
        { $match: { article_id: new mongoose.Types.ObjectId(article_id) } },
        { $sort: { time: -1 } },
        { $skip: (page - 1) * 7 },
        { $limit: 7 },
        {
            $lookup: {//连接用户表
                from: modelUser.collection.name,
                localField: 'user_uid',
                foreignField: 'uid',
                as: 'comment_user'
            }
        },
        {
            $project: {
                "_id": 1,
                "article_id": 1,
                "content": 1,
                "time": 1,
                "user_uid": 1,
                "comment_user.nickname": 1,
                "comment_user.avatarUrl": 1,
                "isComment_user": {
                    $cond: {//类似js的三元表达式
                        if: { $eq: ['$user_uid', myUid] },
                        then: true,
                        else: false
                    }
                }
            }
        }
    ])
    ctx.send('SUCCESS', 200, res)
})

// 关注接口
router.get('/follow-author', new Auth().m, async ctx => {
    const { im_concerned_uid } = ctx.query
    Userconcern(im_concerned_uid)

    // 不能关注自己
    if (im_concerned_uid === ctx.auth.uid) {
        ctx.send('你不能关注自己', 422)
        return false
    }
    // 是否已经关注过
    const exist = await modelConcern.find({
        user_uid: ctx.auth.uid,
        im_concerned_uid
    })
    if (exist.length <= 0) {
        await modelConcern.create({
            user_uid: ctx.auth.uid,//用户的uid
            im_concerned_uid //关注的用户uid
        })
        ctx.send()
    } else {
        ctx.send()
    }
})

// 取消关注
router.get('/unfollow-author', new Auth().m, async ctx => {
    const { im_concerned_uid } = ctx.query
    Userconcern(im_concerned_uid)
    await modelConcern.deleteMany({
        user_uid: ctx.auth.uid,
        im_concerned_uid
    })
    ctx.send()
})

// 进入文章详情页：多表联查
//文章表关联用户表获取作者等信息
//文章表关联点赞表获取点赞数
//关联收藏表获取收藏数量co
//关注评论表获取评论
router.get('/article-data', new Auth().m, async ctx => {

    const { article_id } = ctx.query
    CompanionDetails(article_id)
    const myUid = ctx.auth.uid
     // 定义 Redis key
    const articleKey = `article:${article_id}`;
    const interactionsKey = `article:${article_id}:interactions`;
    // 尝试从 Redis 获取文章静态数据和交互数据
    const articleDataRedis = await client.hGetAll(articleKey);
    const interactionsRedis = await client.hGetAll(interactionsKey);
   // 检查数据是否存在于 Redis
   if (!articleDataRedis || Object.keys(articleDataRedis).length === 0 || !interactionsRedis || Object.keys(interactionsRedis).length === 0) {
        //不存在
        const res = await modelArticle.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(article_id) } },
            looKup().model_user,//连接用户表
            looKup().model_like,//连接点赞表，计算点赞数量
            looKup().model_collect,//连接收藏表，计算收藏数量
            looKup().model_comment,//连接评论表，计算评论数量
            {
                $lookup: {//关注表，用于判断某用户是否关注某作者
                    from: modelConcern.collection.name,
                    localField: 'author_uid',
                    foreignField: 'im_concerned_uid',
                    as: 'concernedUsers'
                }
            },
            {
                $project: {
                    "_id": 1, //
                    "author_id": 1, //作者id
                    "title": 1, //文章名字
                    "content": 1,//文章内容
                    "image": 1,//文章图片
                    "videoUrl": 1,//视频url
                    "address": 1,//文章地址
                    "time": 1,//发布时间
                    "category": 1,//文章种类
                    "likes": { $size: '$likes' },//计算点赞数量
                    "comments": { $size: '$comments' },//计算评论数量
                    "collections": { $size: '$collections' },//计算收藏数量
                    "author_data._id": 1,  //作者id
                    "author_data.avatarUrl": 1, //作者头像
                    "author_data.nickname": 1,//作者昵称
                    "author_data.uid": 1,
                    "isLike": {
                        // 判断是否点过赞
                        // $in操作符用于匹配两个值是否相等，如果相等，返回true，否则false
                        $in: [myUid, "$likes.user_uid"]
                    },
                    "isCollecTions": {
                        // 判断是否已收藏过
                        // $in操作符用于匹配两个值是否相等，如果相等，返回true，否则false
                        $in: [myUid, "$collections.user_uid"]
                    },
                    "isConcerned": {
                        // 判断是否已关注过该作者
                        // $in操作符用于匹配两个值是否相等，如果相等，返回true，否则false
                        $in: [myUid, "$concernedUsers.user_uid"]
                    }
                }
            }
        ])
        const articleData = res[0]
        // 将文章静态数据存储到Redis Hash中
         client.hSet(articleKey, "title", articleData.title);
         client.hSet(articleKey, "content", articleData.content);
         client.hSet(articleKey, "image", JSON.stringify(articleData.image));
         client.hSet(articleKey, "videoUrl", JSON.stringify(articleData.videoUrl));
         client.hSet(articleKey, "address", articleData.address);
         client.hSet(articleKey, "category", articleData.category);
         client.hSet(articleKey, "time", String(articleData.time));  // 确保时间是字符串
         client.hSet(articleKey, "author_data", JSON.stringify(articleData.author_data));
         client.expire(articleKey, 3600); // 设置1小时过期时间
          // 将文章动态交互数据存储到Redis
        // 对于 likes, comments, collections，它们是数字，需要转为字符串
        client.hSet(interactionsKey, "likes", articleData.likes);
        client.hSet(interactionsKey, "comments", articleData.comments);
        client.hSet(interactionsKey, "collections", articleData.collections);
        client.expire(interactionsKey, 3600); // 设置1小时过期时间
            ctx.send('SUCCESS', 200, res[0])
           
        }
        else{
            //redis中存在
            const userInteractions = await checkUserInteractions(myUid,article_id)
            const articleDataFormatted = {
                title: articleDataRedis.title,
                content: articleDataRedis.content,
                image: JSON.parse(articleDataRedis.image),
                videoUrl: JSON.parse(articleDataRedis.videoUrl),
                address: articleDataRedis.address,
                category: articleDataRedis.category,
                time: articleDataRedis.time, 
                author_data: JSON.parse(articleDataRedis.author_data),
                "likes": interactionsRedis.likes,
                "comments": interactionsRedis.comments,
                "collections":interactionsRedis.collections,
                "isLike":userInteractions[0],
                "isCollecTions":userInteractions[1],
                "isConcerned": userInteractions[2]
            };
            ctx.send('SUCCESS', 200, articleDataFormatted);
            console.log(articleDataFormatted)
        }
})
// 进入详情页:短视频类型
router.get('/rec-the-video', new Authuid().m, async ctx => {
    const { article_id, page } = ctx.query
    Commentget(article_id, page)
    const articleId = new mongoose.Types.ObjectId(article_id)
    // 定义 Redis key
    const articleKey = `Vedio:${article_id}`;
    const interactionsKey = `Vedio:${article_id}:interactions`;
    //判断是否为当前用户
    const myUid = ctx.auth.uid ? ctx.auth.uid : 'm1'
    // 尝试从 Redis 获取文章静态数据和交互数据
    const articleDataRedis = await client.hGetAll(articleKey);
    const interactionsRedis = await client.hGetAll(interactionsKey);
   // 检查数据是否存在于 Redis
   if (!articleDataRedis || Object.keys(articleDataRedis).length === 0 || !interactionsRedis || Object.keys(interactionsRedis).length === 0) {
        //不存在
        const res = await modelArticle.aggregate([
        {
                    $match: {
                        fileType: 'video',//要求为视频类型
                        _id: { $nin: [articleId] }//过滤掉本条视频
                    }
                },
                { $skip: (page - 1) * 4 },
                { $limit: 4 },
                looKup().model_user,//连接用户表
                looKup().model_like,//连接点赞表
                looKup().model_collect,//连接收藏表
                looKup().model_comment,//连接评论表
                {
                    $lookup: {//关注表，用于判断某用户是否关注某作者
                        from: modelConcern.collection.name,
                        localField: 'author_uid',
                        foreignField: 'im_concerned_uid',
                        as: 'concernedUsers'
                    }
                },
                {
                    $project: {
                        "_id": 1,
                        "author_id": 1,
                        "title": 1,
                        "content": 1,
                        "videoUrl": 1,
                        "address": 1,
                        "time": 1,
                        "likes": { $size: '$likes' },//计算点赞数量
                        "comments": { $size: '$comments' },//计算评论数量
                        "collections": { $size: '$collections' },//计算收藏数量
                        "author_data._id": 1,
                        "author_data.avatarUrl": 1,
                        "author_data.nickname": 1,
                        "author_data.uid": 1,
                        "isLike": {
                            // 判断是否点过赞
                            // $in操作符用于匹配两个值是否相等，如果相等，返回true，否则false
                            $in: [myUid, "$likes.user_uid"]
                        },
                        "isCollecTions": {
                            // 判断是否已收藏过
                            // $in操作符用于匹配两个值是否相等，如果相等，返回true，否则false
                            $in: [myUid, "$collections.user_uid"]
                        },
                        "isConcerned": {
                            // 判断是否已关注过该作者
                            // $in操作符用于匹配两个值是否相等，如果相等，返回true，否则false
                            $in: [myUid, "$concernedUsers.user_uid"]
                        }
                    }
                }
            ])
            const articleData = res[0];
            // 将文章静态数据存储到Redis Hash中
         client.hSet(articleKey, "title", articleData.title);
         client.hSet(articleKey, "author_id", articleData.author_id);
         client.hSet(articleKey, "content", articleData.content);
         client.hSet(articleKey, "videoUrl", JSON.stringify(articleData.videoUrl));
         client.hSet(articleKey, "address", articleData.address);
         client.hSet(articleKey, "time", String(articleData.time));  // 确保时间是字符串
         client.hSet(articleKey, "author_data", JSON.stringify(articleData.author_data));
         client.expire(articleKey, 3600); // 设置1小时过期时间
          // 将文章动态交互数据存储到Redis
        client.hSet(interactionsKey, "likes", articleData.likes);
        client.hSet(interactionsKey, "comments", articleData.comments);
        client.hSet(interactionsKey, "collections", articleData.collections);
        client.expire(interactionsKey, 3600); // 设置1小时过期时间
        ctx.send('SUCCESS', 200, res[0])
        }
    else{
        //redis中存在
        const userInteractions = await checkUserInteractions(myUid,article_id)
        const articleDataFormatted = {
            title: articleDataRedis.title,
            content: articleDataRedis.content,
            author_id:articleDataRedis.author_id,
            videoUrl: JSON.parse(articleDataRedis.videoUrl),
            address: articleDataRedis.address,
            time: articleDataRedis.time, 
            author_data: JSON.parse(articleDataRedis.author_data),
            "likes": JSON.parse(interactionsRedis.likes),
            "comments": JSON.parse(interactionsRedis.comments),
            "collections":JSON.parse(interactionsRedis.collections),
            "isLike":userInteractions[0],
            "isCollecTions":userInteractions[1],
            "isConcerned": userInteractions[2]
        };
        ctx.send('SUCCESS', 200, articleDataFormatted);
    }    
})

//判断用户是否关注，点赞，评论
async function checkUserInteractions(userId, articleId) {
    // 检查是否点赞
    const isLiked = await modelLike.findOne({
        user_uid: userId,
        article_id: articleId
    }) != null;

    // 检查是否收藏
    const isCollected = await modelCollection.findOne({
        user_uid: userId,
        article_id: articleId
    }) != null;

    // 检查是否关注
    const isConcerned = await modelConcern.findOne({
        user_uid: userId,
        article_id: articleId
    }) != null;

    // 返回一个包含用户交互状态的数组
    return [isLiked, isCollected,  isConcerned];
}


// 进入文章详情页：推荐相关
router.get('/rec-the-same', async ctx => {
    const { article_id, page } = ctx.query
    Commentget(article_id, page)
    const articleAddress = await modelArticle.find(
        { _id: article_id }, { address: true }).lean()
    const query = { $regex: articleAddress[0].address, $options: 'i' }
    const articleId = new mongoose.Types.ObjectId(article_id)
    const userArticles = await modelArticle.aggregate([
        {
            $match: {
                $and: [
                    {
                        $or: [
                            { address: query }
                        ]
                    },
                    {//过滤掉当前正在阅读的文章
                        _id: { $nin: [articleId] }
                    }
                ]
            }
        },
        { $skip: (page - 1) * 6 },
        { $limit: 6 },
        looKup().model_user,
        looKup().model_like,
        looKup().project
    ])
    ctx.send('SUCCESS', 200, userArticles)
})


// 获取用户的点赞，关注，粉丝数量
router.get('/my-related', new Auth().m, async ctx => {
        // 我收到的点赞数量
        const likeCount = await modelLike.find({
            author_uid: ctx.auth.uid
        }).countDocuments()
        // 我关注的作者数量
        const concernCount = await modelConcern.find({
            user_uid: ctx.auth.uid
        }).countDocuments()
        // 关注我的粉丝数量
        const fansCount = await modelConcern.find({
            im_concerned_uid: ctx.auth.uid
        }).countDocuments()
        ctx.send('SUCCESS', 200, { likeCount, concernCount, fansCount })
})

// 查询用户发布的活动介绍
router.get('/myArticles', new Auth().m, async ctx => {
    const { page } = ctx.query
    Resreturn(page)
    const res = await modelArticle.find({
        author_uid: ctx.auth.uid
    })
        .sort({ time_stamp: -1 })
        .skip((page - 1) * 6)
        .limit(6)
        .select('cover_image address fileType')
    ctx.send('SUCCESS', 200, res)
})
// 查询用户收藏的活动介绍
router.get('/myCollEction', new Auth().m, async ctx => {
    const { page } = ctx.query
    Resreturn(page)
    const articleId = await modelCollection.find({
        user_uid: ctx.auth.uid
    }, { article_id: true })
    const resId = await articleId.map(item => item.article_id)
    const res = await modelArticle.aggregate([
        { $match: { _id: { $in: resId } } },//以数组形式匹配活动表的_id
        { $sort: { time_stamp: -1 } },
        { $skip: (page - 1) * 6 },
        { $limit: 6 },
        {
            $project: {
                "_id": 1,
                "address": 1,
                "fileType": 1,
                "cover_image": 1
            }
        }
    ])
    ctx.send('SUCCESS', 200, res)
})

// 查询用户点赞(喜欢)的文章
router.get('/myLikeArticle', new Auth().m, async ctx => {
    const { page } = ctx.query
    Resreturn(page)
    const articleId = await modelLike.find({
        user_uid: ctx.auth.uid
    }, { article_id: true })
    const resId = await articleId.map(item => item.article_id)
    const res = await modelArticle.aggregate([
        { $match: { _id: { $in: resId } } },//以数组形式匹配文章表的_id
        { $sort: { time_stamp: -1 } },
        { $skip: (page - 1) * 6 },
        { $limit: 6 },
        {
            $project: {
                "_id": 1,
                "address": 1,
                "fileType": 1,
                "cover_image": 1
            }
        }
    ])
    ctx.send('SUCCESS', 200, res)
})

// 关注页面：获取用户关注的作者以及作者的
router.get('/user-following-author', new Auth().m, async ctx => {
    const { page } = ctx.query
    Resreturn(page)
    // 获取用户关注的作者的uid
    const imcUid = await modelConcern.find({ user_uid: ctx.auth.uid }, { im_concerned_uid: true })
    const imcUidMap = imcUid.map(item => item.im_concerned_uid)

    // 获取点赞表里的文章_id
    const likeArtId = await modelLike.find({ user_uid: ctx.auth.uid }, { article_id: true })
    const likeArtIdMap = likeArtId.map(item => item.article_id)

    // 获取收藏表里的文章_id
    const collctArtId = await modelCollection.find({ user_uid: ctx.auth.uid }, { article_id: true })
    const collectArtIdMap = collctArtId.map(item => item.article_id)

    //每个关注的对象只呈现出前三个文章
    const res = await modelArticle.aggregate([
        { $match: { author_uid: { $in: imcUidMap } } },
        { $sort: { time_stamp: -1 } },
        {
            $group: {
                _id: "$author_uid",//根据作者的uid分组
                articles: { $push: "$$ROOT" },//将每篇文章作为数组元素，$$ROOT表示该作者的所有文章
            }
        },
        {//对每个作者限制前三篇文章
            $project: {
                _id: 0,
                author_uid: "$_id",
                articles: { $slice: ["$articles", 3] }
            }
        },
        { $unwind: "$articles" },//展开每篇文章
        looKup().model_user,//关联用户表，获取作者的头像昵称
        looKupConcern("articles._id").model_like,//关联点赞表
        looKupConcern("articles._id").model_comment,//关联评论表
        looKupConcern("articles._id").model_collect,//关联收藏表
        {
            $project: {
                _id: "$articles._id",
                title: "$articles.title",
                content: "$articles.content",
                image: "$articles.image",
                address: "$articles.address",
                cover_image: "$articles.cover_image",
                videoUrl: "$articles.videoUrl",
                fileType: "$articles.fileType",
                time_stamp: "$articles.time_stamp",
                likes: { $size: "$likes" },//计算点赞数量
                comments: { $size: "$comments" },//计算评论数量
                collections: { $size: "$collections" },//计算收藏数量
                "author_data.avatarUrl": 1,//头像
                "author_data.nickname": 1,//昵称
                "isLiked": {//判断用户对每篇文章的点赞情况
                    $cond: {
                        if: { $in: ["$articles._id", likeArtIdMap] },
                        then: true,
                        else: false
                    }
                },
                "isCollect": {//判断用户对每篇文章的收藏情况
                    $cond: {
                        if: { $in: ["$articles._id", collectArtIdMap] },
                        then: true,
                        else: false
                    }
                }

            }
        },
        { $skip: (page - 1) * 6 },
        { $limit: 6 }
    ])
    // 处理相对时间
    //因为如果是刚刚发布的，按照格式会显示“刚刚前”，所以我们重新设置一下，如果小于60s设置为多少s前
    res.forEach(item => {
        const diff = moment().diff(item.time_stamp * 1000, 'seconds')
        item.time_stamp = diff < 60 ? `${diff}秒前` : moment(item.time_stamp * 1000).fromNow()
    })
    ctx.send('SUCCESS', 200, res)
})

module.exports = router.routes()