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
    Searchactivity,
    Clssifyarticles
} = require('@/config/valiData')
const { Auth } = require('@/token/auth')
const { Authuid } = require('@/token/auth_uid')
const moment = require('moment')
moment.locale('zh-cn')
const mongoose = require('mongoose')
const { looKup } = require('@/config/lookup')

/**
 * 主页搜索界面的接口
 */

// 获取前十个热门的地点：小程序和后台管理公用
//这里的逻辑是根据地点的文章数来判断热门
router.get('/hot-area', async ctx => {
    const res = await modelArticle.aggregate([
        {
            $group: {//分组
                _id: '$address',//根据地址来分组
                count: { $sum: 1 },
                image: { $first: "$cover_image.url" },
            }
        },
        {
            $sort: { count: -1 }
        },
        { $limit: 5 }
    ])
    ctx.send('SUCCESS', 200, res)
})

// 获取搜索关键词:文章（地理位置和标签）和作者
//这里的作用只是你填了搜索词然后自动弹出一些对应的搜索内容
router.get('/search-activity', async ctx => {
    const { keywords } = ctx.query
    if (keywords.trim() === '') {
        ctx.send('SUCCESS', 200, [])
        return false
    }
    const query = { $regex: keywords, $options: 'i' }
    // 匹配文章表
    const articles = await modelArticle.find({
        $or: [
            { address: query },
            { tag: { $in: [keywords] } },
        ]
    }).select('address tag')
    // 匹配用户表
    const users = await modelUser.find({
        $or: [
            { uid: query },
            { nickname: query }
        ]
    }).select('nickname')
    const articleResults = articles.map(article => {
        // 检查是否 address 字段匹配了关键词
        if (article.address && article.address.match(new RegExp(keywords, 'i'))) {
            return article.address; // 如果是基于 address 的匹配，只返回 address
        }
        // 如果基于 tag 匹配，则不返回 address
        return article.tag ? [...article.tag] : [];
    }).flat(); // 将数组扁平化，因为基于 tag 的匹配可能返回一个标签数组
    const userResults = users.map(user => user.nickname);

    // 合并文章和用户的结果，并去重
    const results = [...new Set([...articleResults, ...userResults])];

    ctx.send('SUCCESS', 200, results);
})

// 根据关键词搜索文章
router.get('/paging-search-result', async ctx => {
    const { keywords, page } = ctx.query
    Clssifyarticles(keywords, page)
    const query = { $regex: keywords, $options: 'i' }
    const res = await modelArticle.aggregate([
        {
            $match: {
                $or: [
                    { title: query },
                    { content: query },
                    { address: keywords },
                    { tag: { $in: [keywords] } },
                    {category: query}
                ]
            }
        },
        { $skip: (page - 1) * 6 },
        { $limit: 6 },
        looKup().model_user,
        looKup().model_like,
        looKup().project
    ])
    ctx.send('SUCCESS', 200, res)
})

// 根据关键词搜索作者（uid 和 昵称）
router.get('/search-author', new Authuid().m, async ctx => {
    const { keywords, page } = ctx.query
    Clssifyarticles(keywords, page)
    const query = { $regex: keywords, $options: 'i' }
    const myUid = ctx.auth.uid ? ctx.auth.uid : 'm1'
    const res = await modelUser.aggregate([
        {
            $match: {
                $or: [{ uid: query }, { nickname: query }]
            }
        },
        { $skip: (page - 1) * 10 },
        { $limit: 10 },
        {
            $lookup: {//关联关注表，获取作者的粉丝数量
                from: modelConcern.collection.name,
                localField: 'uid',
                foreignField: 'im_concerned_uid',
                as: 'concernnedUsers'
            }
        },
        {
            $project: {
                _id: 1,
                avatarUrl: 1,
                nickname: 1,
                uid: 1,
                numberOfFans: { $size: "$concernnedUsers" },
                concernedUser: {
                    $in: [myUid, "$concernnedUsers.user_uid"]
                }
            }
        }
    ])
    ctx.send('SUCCESS', 200, res)
})
module.exports = router.routes()