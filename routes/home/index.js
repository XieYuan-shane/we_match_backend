const router = require('@koa/router')()
const {
    modelDailyrecom,
    modelFourArticle
} = require('../../models/collection-pc')
const {
    modelUser,
    modelArticle,
    modelHometab,
    modelRecommendation
} = require('../../models/collection')
const {
    Resreturn,
    Clssifyarticles
} = require('@/config/valiData')
const mongoose = require('mongoose')
const { Auth } = require('../../token/auth')
const{Authuid} = require('../../token/auth_uid')
const { gentoken } = require('../../token/jwt')
const moment = require('moment')
moment.locale('zh-cn')
const { looKup, looKupRecommend } = require('../../config/lookup')
const fs = require('fs')
const client = require('../redis/index.js'); // 引入Redis客户端实例

// 获取小程序端顶部每日推荐
router.get('/wxGainDailyRecom', async ctx => {
    //分页查询
    const { page } = ctx.query
    Resreturn(page)
    const value = await client.get('wxGainDailyRecom');
    if(value != null) {
        ctx.send('SUCCESS', 200, JSON.parse(value))
    }
    else{
        const res = await modelDailyrecom.find({}, {
            //下面两个不返回
            time: false, timestamp: false
        })
            .sort({ timestamp: -1 })
            .skip((page - 1) * 1)
            .limit(1)//每次只返回一条数据
    
        // 获取数据总条数
        const count = await modelDailyrecom.countDocuments()
        const resData = { data: res, count }
        client.set('wxGainDailyRecom', JSON.stringify(resData));
        //设置一个过期时间
        client.expire('wxGainDailyRecom',3600);
        ctx.send('SUCCESS', 200, resData)
    }
    
})

// 获取小程序端四个文章推荐
router.get('/wxGainRecomArticle', async ctx => {
    const redis_key = "wxGainRecomArticle";
    const value = await client.get(redis_key);
    if(value != null) {
        ctx.send('SUCCESS', 200, JSON.parse(value))
    }
    else{
        const res = await modelFourArticle.aggregate([
            { $sort: { timestamp: -1 } },
            looKupRecommend().model_Article,
            looKupRecommend().model_reco_user,
            { $unwind: '$articleData' },
            { $unwind: '$userData' },
            {
                //获取的数据
                $project: {
                    "_id": 1,
                    "imageUrl": 1,
                    "article_id": 1,
                    "title": "$articleData.title",
                    "address": "$articleData.address",
                    "fileType": "$articleData.fileType",
                    "nickname": "$userData.nickname",
                    "avatarUrl": "$userData.avatarUrl"
                }
            }
        ])
        client.set(redis_key, JSON.stringify(res));
        //设置一个过期时间
        client.expire(redis_key,3600);
        ctx.send('SUCCESS', 200, res)
    }
   
})

// 分类切换tab（分类栏目）
router.get('/article-class',async ctx => {
    const res = moment().utcOffset(8).format('M')
    const redis_key = 'article-class'
    const value = await client.get(redis_key)
    if(value != null){
        ctx.send('SUCCESS', 200, JSON.parse(value))
    }
    else{
        const arr = [
            { name: '推荐', key: '001' },
            { name: `${res}月热门`, key: '002' },
            { name: '四院', key: '003' },
            { name: '三院', key: '004' },
            { name: '二院', key: '005' },
            { name: '一院', key: '006' },
            { name: 'N系', key: '007' },
            { name: 'E系', key: '008' },
            { name: '其他', key: '009' },
        ]
        client.set(redis_key, JSON.stringify(arr));
        //设置一个过期时间
        client.expire(redis_key,3600*24);
        ctx.send('SUCCESS', 200, arr)
    }
    
})



//获取首页瀑布流文章，这里也就是根据address分类
//先根据key筛选到name
router.get('/user-activities',new Authuid().m,async ctx => {
    const { keywords, page } = ctx.query
    Clssifyarticles(keywords, page)
    let match = {}
    const address003 = ['何鸿燊东亚书院', '满珍纪念书院', '蔡继有书院','霍英东珍禧书院'];
    const address004 = ['曹光彪书院', '郑裕彤书院', '吕志和书院'];
    const address005 = ['马万祺罗柏心书院', '张昆仑书院'];
    const address006 = ['绍邦书院'];
    const address007 = ['N1聚贤楼', 'N2大学会堂','N6行政楼','N8体育馆','N9运动场','N21电子信息大楼', 'N22中医药大楼','N23能源环境大楼'];
    const address008 = ['E1大学展馆', 'E2图书馆','E11科技学院','E12健康科学学院','E21人文社科楼','E31学生活动中心','E32法学院','E33教育学院'];
    const excludedAddresses = [...address003, ...address004,...address005,...address006,...address007,...address008];
    if (keywords === '001') {
        // 文章基本信息的键
        const articleInfoKey = "articlesInfo";
        // 文章 likes 的键
        const articleLikesKey = "articlesLikes";
        // 尝试从 Redis 获取文章静态数据
        const articleDataRedis = await client.hGetAll(articleInfoKey);
        if (!articleDataRedis || Object.keys(articleDataRedis).length === 0) {
            // Redis 中没有缓存，根据当前用户ID查询推荐列表
            const recommendation = await modelRecommendation.findOne({ userId: ctx.auth.uid });
                if(recommendation !== null){
                    match = {
                        _id: { $in: recommendation.recommendListId.map(id => new mongoose.Types.ObjectId(id)) }
                    };
                    // 使用推荐的文章ID作为匹配条件
                    const articles = await modelArticle.aggregate([
                        { $match: match },
                        { $skip: (page - 1) * 6 },
                        { $limit: 10 },
                        looKup().model_user,
                        looKup().model_like,
                        looKup().project
                    ]);
                    // 重排序 articles 以匹配 recommendListId 的顺序
                    const sortedArticles = recommendation.recommendListId
                    .map(recommendId => articles.find(article => article._id.toString() === recommendId.toString()))
                    .filter(article => article !== undefined); // 过滤掉未找到的文章
                    // 存储到Redis
                    sortedArticles.forEach(async (article) => {
                        const { likes, ...articleInfo } = article; // 分离 _id, likes 和其他信息
                         await client.hSet(articleInfoKey, article._id.toString(), JSON.stringify(articleInfo));
                         await client.hSet(articleLikesKey, article._id.toString(), likes);
                    });
                     await client.expire(articleLikesKey, 3600);
                     await client.expire(articleInfoKey, 3600);
                    ctx.send('SUCCESS', 200, sortedArticles);
                }
                else{
                    match = {}
                }
     
        } else {
            // Redis 中有缓存，从 Redis 中取出数据
            const articles = Object.values(articleDataRedis).map(articleInfo => JSON.parse(articleInfo));
            // 还需要从 Redis 中获取每篇文章的 likes
            const articlesWithLikes = await Promise.all(articles.map(async (article) => {
                const likes = await client.hGet(articleLikesKey, article._id.toString());
                return { ...article, likes: likes }; 
            }));
            // 发送从 Redis 获取的数据
            ctx.send('SUCCESS', 200, articlesWithLikes);
    }
}
    else if (keywords === '002') {
        // 去当前月份月初和月末的时间戳
        const startOfMonth = moment().clone().startOf('month').unix();
        const endOfMonth = moment().clone().endOf('month').unix();
        match = {
            time_stamp: {
                $gte: startOfMonth,
                $lte: endOfMonth
            }
        }
    } else if (keywords === '003') {
        match = { address: { $in: address003 } }
    } // 如果keywords为003 {
    else if (keywords === '004') {
        match = { address: { $in: address004 } }; // 如果keywords为003 ——四院
    }else if (keywords === '005') {
        match = { address: { $in: address005 } }; 
    }
    else if (keywords === '006') {
        match = { address: { $in: address006 } }; 
    }
    else if (keywords === '007') {
        match = { address: { $in: address007 } }; 
    }
    else if (keywords === '008') {
        match = { address: { $in: address008 } }; 
    }
    else{
        match = {address: { $nin: excludedAddresses } }; //其他的情况
    }
    const res = await modelArticle.aggregate([
        { $match: match },
        { $sort: { time_stamp: -1 } },
        { $skip: (page - 1) * 6 },
        { $limit: 6 },
        looKup().model_user,
        looKup().model_like,
        looKup().project
    ])
    ctx.send('SUCCESS', 200, res)
})

// 登录校验
router.get('/check-login', new Auth().m, async ctx => {
    const res = await modelUser.find({ uid: ctx.auth.uid })
    if (res.length > 0) {
        ctx.send()
    } else {
        ctx.send('SUCCESS', 401)
    }
})

// 根据文章分类关键词查询文章
router.get('/classifyArticles',new Auth().m, async ctx => {
    const { keywords, page } = ctx.query
    Clssifyarticles(keywords, page)
    // const query = { $regex: keywords, $options: 'i' }
    const res = await modelArticle.aggregate([
        {
            $match: {category: keywords }
        },
        { $skip: (page - 1) * 6 },
        { $limit: 6 },
        looKup().model_user,
        looKup().model_like,
        looKup().project
    ])
    ctx.send('SUCCESS', 200, res)
})

module.exports = router.routes()