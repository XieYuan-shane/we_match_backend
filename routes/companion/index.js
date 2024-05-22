const router = require('@koa/router')()
const {
    modelCompanion,
    modelSignup,
    modelUser,
    modelChatGroup,
    modelArticle
} = require('@/models/collection')
const {
    InitiatingPartner,
    SignupPartner,
    CompanionQuery,
    CompanionDetails,
    Resreturn,
    Commentget,
    dropGroup
} = require('@/config/valiData')
const { Auth } = require('@/token/auth')
const mongoose = require('mongoose')
const redis = require('redis')
const moment = require('moment')
moment.locale('zh-cn')
const { looKup, looKupCompanion } = require('@/config/lookup')
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
  
// 发起结伴
router.post('/initiating-partner', new Auth().m, async ctx => {
    const {
        description,
        image,
        full_address,
        companion_time,
        number_of_people,//希望人数
        category,//大致种类
        article_id
    } = ctx.request.body
    
    //校验数据
    InitiatingPartner(
        description,
        image,
        full_address,
        companion_time,
        number_of_people
    )
    const companion_timestamp = moment(companion_time).unix()
    const companion = await modelCompanion.create({
        uid: ctx.auth.uid,
        description,
        image,
        full_address,
        companion_time,
        number_of_people,
        companion_timestamp,
        category,//分类
        article_id
    })
    await modelChatGroup.create({
            activityId: companion._id, // 使用创建的结伴活动的_id作为activityId
            participants: [ctx.auth.uid], // 初始时，群组中只有创建者
            messages: [] // 初始时没有消息
    }) 
    ctx.send('Success', 200, '成功');
})

//退出结伴
router.post('/drop-group',new Auth().m, async ctx => {
     // 从请求体中获取Id和可能的userId
     const {Id, userid} = ctx.request.body;
     // 如果提供了userId，使用它；否则，使用认证用户的uid
     const userId = userid || ctx.auth.uid; 
    //校验
    dropGroup(Id) 
    // 先删除报名表中的记录
    try {
        await modelSignup.deleteOne({ signup_id:Id, user_uid: userId, });
        // 更新Companion表的黑名单
        //注意必须加new:new mongoose.Types.ObjectId(Id)
        await modelCompanion.updateOne(
            { _id:new mongoose.Types.ObjectId(Id) },
            { $push: { blackList: userId } }
        );
        ctx.send('Success', 200, '退出成功');
    } catch (error) {
        ctx.send('error', 404, '退出失败');
        return;
    }

   // 检查Redis中是否有该活动的participants缓存
   try {
    const participantsKey = `groupParticipants:${Id}`;
    let participantsStr = await client.lRange(participantsKey, 0, -1);

    if (participantsStr.length > 0) {
        // 解析每个参与者信息，寻找匹配的userId并移除
        let participantsArray = participantsStr.filter(participantStr => {
            let participant = JSON.parse(participantStr);
            return participant.userId !== userId; // 假设参与者信息以JSON存储且有userId字段
        });

        // 清空当前列表
        await client.del(participantsKey);
        // 如果还有剩余的参与者，重新添加到Redis列表中
        if (participantsArray.length > 0) {
            client.rPush(participantsKey, ...participantsArray); // 重新添加剩余的参与者
            client.expire(participantsKey, 3600); // 重新设置过期时间
        }
    }
} catch (error) {
    console.error('处理Redis缓存失败', error);
    // 可选：决定是否要将Redis错误返回给用户
}
});
// 报名结伴
router.post('/sign-up-partner', new Auth().m, async ctx => {
    const {
        signup_id, //报名哪个活动
        contact_inform,  //联系方式
        gender, //性别
        introduce //自我介绍
    } = ctx.request.body
    //校验
    SignupPartner(signup_id, contact_inform, gender, introduce)

     // 首先，查询对应的Companion文档以检查用户是否在黑名单中
     const companionInfor = await modelCompanion.findOne({ _id: signup_id });

     // 检查用户是否在黑名单中
     if (companionInfor.blackList.includes(ctx.auth.uid)) {
         ctx.send('Error', 403, '您无法参与此活动，因为您在黑名单中');
         return
     }
 
    //检验人数是否多
    const results = await modelSignup.aggregate([
        { $match: { signup_id: new mongoose.Types.ObjectId(signup_id) } },
        { $group: { _id: '$signup_id', total: { $sum: 1 } } }
    ]);
    // 检查是否有返回的结果，并获取total值
    const totalSignups = results.length > 0 ? results[0].total : 0;
  
    // 使用Mongoose的findOne方法查询特定_id的文档
    const companion = await modelCompanion.findOne({ _id: signup_id }, 'number_of_people');
    
    if (totalSignups >= companion.number_of_people) {
        ctx.send('false', 400, '报名不成功，已经满员');
    }
   
    const lockKey = `lock:signup:${signup_id}`;
    const lockValue = `locked:${Date.now()}`;
    const lockTimeout = 10; // 锁的超时时间，单位为秒

    // 尝试获取锁
    const acquired = await client.set(lockKey, lockValue, 'EX', lockTimeout, 'NX');

    if (acquired === 'OK') {
        try {
            // 执行报名逻辑...
            await modelSignup.create({
                user_uid: ctx.auth.uid,
                signup_id,
                contact_inform,
                gender,
                introduce
            });
            // 如果聊天组已存在，则加入当前用户的uid到participants数组
            await modelChatGroup.updateOne({ activityId: signup_id }, { $addToSet: { participants: ctx.auth.uid } });
            //对redis的操作
            // 查询当前用户的信息
            const currentUserInfo = await modelUser.findOne({ uid: ctx.auth.uid }, 'uid avatarUrl nickname');
            // 检查Redis中是否有对应的聊天组数据
             const participantsKey = `groupParticipants:${signup_id}`;
            let participants = await client.lRange(participantsKey, 0, -1);
            if (participants.length > 0) {
                // 如果Redis中已有数据，更新Redis中的participants列表
                await client.rPush(participantsKey, JSON.stringify({ user_id: currentUserInfo.uid, avatarUrl: currentUserInfo.avatarUrl, nickname: currentUserInfo.nickname }));
            }
            else{
                //这里是存入数据库的操作
                const res = await fetchAndUpdateParticipants(signup_id,participantsKey)
            }
            // 响应成功报名
            ctx.send('Success', 200, '报名成功');
            } 
                catch (error) {
            ctx.send('Error', 500, '报名失败');
        } finally {
            // 释放锁
            // 确保只有加锁的实例才能释放锁
            const currentValue = await client.get(lockKey);
            if (currentValue === lockValue) {
                await client.del(lockKey);
            }
        }
 
    }else {
        // 获取锁失败，返回错误或进行重试逻辑
        ctx.send('Error', 429, '系统繁忙，请稍后再试');
    }
});


// 首页筛选组队
router.get('/companion-query', async ctx => {
    //category中有推荐等
    const { category, keyword, page } = ctx.query
    CompanionQuery(category, keyword, page)
    //在这里使用redis缓存来解决问题
    // 构建一个基于查询参数的唯一键
    // const cacheKey = `companion-query:${category}:${keyword}:${page}`;
    // const value = await client.get(cacheKey);
    // //也就是redis中包含对应的数据
    // if(value != null){
        
    //     ctx.send('SUCCESS', 200, JSON.parse(value))
    // }
    // //redis中不包含数据
    // else{
        // 本月月初和月末的时间戳
    const startOfMonth = moment().clone().startOf('month').unix()
    const endOfMonth = moment().clone().endOf('month').unix()
    // 下月月初和月末的时间戳
    const startOfNextMonth = moment().clone().add(1, 'month').startOf('month').unix()
    const endOfNextMonth = moment().clone().add(1, 'month').endOf('month').unix()
    var match = {}
    if (category === '推荐' && keyword === '全部') {
        match = {}
    } else if (category === '推荐' && keyword === '本月出发') {
        match = {
            companion_timestamp: {
                $gte: startOfMonth,
                $lte: endOfMonth
            }
        }
    } else if (category === '推荐' && keyword === '下月出发') {
        match = {
            companion_timestamp: {
                $gte: startOfNextMonth,
                $lte: endOfNextMonth
            }
        }
    } else if (category != '推荐' && keyword === '全部') {
        match = { category }
    } else if (category != '推荐' && keyword === '本月出发') {
        match = {
            category,
            companion_timestamp: {
                $gte: startOfMonth,
                $lte: endOfMonth
            }
        }
    } else if (category != '推荐' && keyword === '下月出发') {
        match = {
            category,
            companion_timestamp: {
                $gte: startOfNextMonth,
                $lte: endOfNextMonth
            }
        }
    }
    const res = await modelCompanion.aggregate([
        { $match: match },
        { $sort: { timestamp: -1 } },
        { $skip: (page - 1) * 6 },
        { $limit: 6 },
        looKupCompanion().model_user,
        looKupCompanion().model_signup,
        {
            $project: {
                _id: 1,
                description: 1,
                image: 1,
                city: 1,
                full_address: 1,
                companion_time: 1,
                number_of_people: 1,
                timestamp: 1,
                category: 1,
                "author_data.nickname": 1,
                "author_data.avatarUrl": 1,
                signups: { $size: '$signups' }
            }
        }
    ])
    // 处理相对时间
    res.forEach(item => {
        const diff = moment().diff(item.timestamp * 1000, 'seconds')
        item.timestamp = diff < 60 ? `${diff}秒前` : moment(item.timestamp * 1000).fromNow()
    })
    // //如果redis中不包含对应的数据则进行redis数据缓存
    // client.set(cacheKey,JSON.stringify(res));
    // //过期时间设置为1个小时
    // client.expire(cacheKey,3600);
    
    ctx.send('SUCCESS', 200, res)
  
})


router.get('/companion-details', new Auth().m, async ctx => {
    const { id } = ctx.query;
    CompanionDetails(id);
    const res_a = await modelUser.findOne({
        uid: ctx.auth.uid
    });

    const res = await modelCompanion.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(id) } },
        looKupCompanion().model_signup,
        looKupCompanion().model_user,
        {
            $lookup: { //关联用户表，获取报名用户的头像昵称
                from: modelUser.collection.name,
                localField: 'signups.user_uid',
                foreignField: 'uid',
                as: 'user_info'
            }
        },
        {
            $addFields: {
                isInBlackList: {
                    $cond: {
                        if: { $ne: [{ $indexOfArray: ["$blackList", ctx.auth.uid] }, -1] },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                _id: 1,
                description: 1,
                image: 1,
                uid: 1,
                full_address: 1,
                companion_time: 1,
                number_of_people: 1,
                timestamp: 1,
                category: 1, // 如果有这个字段的话
                "author_data.nickname": 1,
                "author_data.avatarUrl": 1,
                "my_info": {
                    "nickname": res_a.nickname,
                    "avatarUrl": res_a.avatarUrl
                },
                isInBlackList: 1, // 现在可以这样引用
                "signups": {
                    $map: {
                        input: "$signups",
                        as: "signup",
                        in: {
                            "gender": "$$signup.gender",
                            "avatarUrl": { $arrayElemAt: ["$user_info.avatarUrl", { $indexOfArray: ["$user_info.uid", "$$signup.user_uid"] }] },
                            "nickname": { $arrayElemAt: ["$user_info.nickname", { $indexOfArray: ["$user_info.uid", "$$signup.user_uid"] }] },
                        }
                    }
                }
            }
        }
    ]);

    // 处理相对时间
    res.forEach(item => {
        const diff = moment().diff(item.timestamp * 1000, 'seconds');
        item.timestamp = diff < 60 ? `${diff}秒前` : moment(item.timestamp * 1000).fromNow();
    });

    ctx.send('SUCCESS', 200, res);
});
//通过文章的Id来获取对应的结伴详情
router.get('/getCompIdByActivityId', new Auth().m, async ctx => {
    const { articleId } = ctx.query;
    CompanionDetails(articleId);
    const companionId = await modelCompanion.findOne({ article_id: articleId }, '_id').lean();
    console.log(companionId);
    ctx.send('SUCCESS', 200, companionId);
});


// 查询是否已报名
router.get('/signup-query', new Auth().m, async ctx => {
    const { id } = ctx.query
    CompanionDetails(id)
    const res_a = await modelCompanion.find({
        _id: id, uid: ctx.auth.uid
    })
    const res_b = await modelSignup.find({
        signup_id: id, user_uid: ctx.auth.uid
    })
    let queryRes = ''
    if (res_a.length > 0) {
        //用户自己发表的
        queryRes = '001'
    } else {
        if (res_b.length > 0) {
            queryRes = '002'//已报名
        } else {
            queryRes = '003'//未报名
        }
    }
    ctx.send('SUCCESS', 200, queryRes)
})

// 我参与的活动
router.get('/par-in-activities', new Auth().m, async ctx => {
    const { page } = ctx.query
    Resreturn(page)
    const res = await modelSignup.aggregate([
        { $match: { user_uid: ctx.auth.uid } },
        { $sort: { timestamp: -1 } },
        { $skip: (page - 1) * 6 },
        { $limit: 6 },
        looKupCompanion().model_companion,
        {
            $lookup: {//关联报名表，计算报名人数
                from: modelSignup.collection.name,
                localField: 'my_companion._id',
                foreignField: 'signup_id',
                as: 'signpCount'
            }
        },
        {
            $lookup: {//关联用户表，获取作者的头像，昵称
                from: modelUser.collection.name,
                localField: 'my_companion.uid',
                foreignField: 'uid',
                as: 'author_data'
            }
        },
        { $unwind: "$my_companion" },//展开活动表
        {
            $project: {
                _id: "$my_companion._id",
                description: "$my_companion.description",
                image: "$my_companion.image",
                city: "$my_companion.city",
                full_address: "$my_companion.full_address",
                companion_time: "$my_companion.companion_time",
                number_of_people: "$my_companion.number_of_people",
                timestamp: "$my_companion.timestamp",
                "author_data.nickname": 1,
                "author_data.avatarUrl": 1,
                count: { $size: '$signpCount' }//计算报名人数
            }
        }
    ])
    // 处理相对时间
    res.forEach(item => {
        const diff = moment().diff(item.timestamp * 1000, 'seconds')
        item.timestamp = diff < 60 ? `${diff}秒前` : moment(item.timestamp * 1000).fromNow()
    })
    ctx.send('SUCCESS', 200, res)
})

// 我发起的活动
router.get('/my-in-activities', new Auth().m, async ctx => {
    const { page } = ctx.query
    Resreturn(page)
    const res = await modelCompanion.aggregate([
        { $match: { uid: ctx.auth.uid } },
        { $sort: { timestamp: -1 } },
        { $skip: (page - 1) * 6 },
        { $limit: 6 },
        looKupCompanion().model_user,
        looKupCompanion().model_signup,
        {
            $project: {
                _id: 1,
                description: 1,
                image: 1,
                city: 1,
                full_address: 1,
                companion_time: 1,
                number_of_people: 1,
                timestamp: 1,
                "author_data.nickname": 1,
                "author_data.avatarUrl": 1,
                count: { $size: '$signups' }//计算报名人数
            }
        }
    ])
    // 处理相对时间
    res.forEach(item => {
        const diff = moment().diff(item.timestamp * 1000, 'seconds')
        item.timestamp = diff < 60 ? `${diff}秒前` : moment(item.timestamp * 1000).fromNow()
    })
    ctx.send('SUCCESS', 200, res)
})

// 管理成员
router.get('/managing-member', new Auth().m, async ctx => {
    //通过活动id管理成员
    const { id, page } = ctx.query
    Commentget(id, page)
    const res = await modelSignup.aggregate([
        { $match: { signup_id: new mongoose.Types.ObjectId(id) } },
        { $sort: { timestamp: -1 } },
        { $skip: (page - 1) * 6 },
        { $limit: 6 },
        {
            $lookup: {//关联用户表，获取报名用户头像，昵称
                from: modelUser.collection.name,
                localField: 'user_uid',
                foreignField: 'uid',
                as: 'author_data'
            }
        },
        {
            $project: {
                _id: 1,
                contact_inform: 1,
                gender: 1,
                introduce: 1,
                timestamp: 1,
                "author_data.uid":1,
                "author_data.nickname": 1,
                "author_data.avatarUrl": 1
            }
        }
    ])
    // 处理相对时间
    res.forEach(item => {
        const diff = moment().diff(item.timestamp * 1000, 'seconds')
        item.timestamp = diff < 60 ? `${diff}秒前` : moment(item.timestamp * 1000).fromNow()
    })
    ctx.send('SUCCESS', 200, res)
})
async function fetchAndUpdateParticipants(id, participantsKey) {
    const res = await modelCompanion.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(id) } },
        looKupCompanion().model_signup,
        looKupCompanion().model_user,
        {
            $lookup: { 
                from: modelUser.collection.name,
                localField: 'signups.user_uid',
                foreignField: 'uid',
                as: 'user_info'
            }
        },
        {
            $project: {
                uid:1,
                "author_data.nickname": 1,
                "author_data.avatarUrl": 1,
                "signups": { 
                    $map: {
                        input: "$signups",
                        as: "signup",
                        in: {
                            "user_id": "$$signup.user_uid",
                            "avatarUrl": { $arrayElemAt: ["$user_info.avatarUrl", { $indexOfArray: ["$user_info.uid", "$$signup.user_uid"] }] },
                            "nickname": { $arrayElemAt: ["$user_info.nickname", { $indexOfArray: ["$user_info.uid", "$$signup.user_uid"] }] },
                        }
                    }
                }
            }
        }
    ]);
    let author_data = {
        user_id: res[0].uid,
        avatarUrl:res[0].author_data[0].avatarUrl,
        nickname:res[0].author_data[0].nickname
    }
    let participants = [];
    if (res[0].signups.length === 0) {
        participants.push(author_data);
        client.rPush(participantsKey, JSON.stringify(author_data));
        // 可选: 设置Redis key的过期时间，例如1小时
        client.expire(participantsKey, 3600);
    }
    else {
        res[0].signups.unshift(author_data);
        //将查询结果存入Redis
        res[0].signups.forEach(participant => {
            client.rPush(participantsKey, JSON.stringify(participant), err => {
              if (err) console.error('Error pushing to Redis:', err);
            });
        });
        participants = res[0].signups;
    }
    return participants;
}


//根据活动id判断用户是否为作者
//如果是作者就且没有创捷组队返回001
//如果不是作者且没有创建组队返回002
//如果创建了组队返回003
router.get('/getArticleIsGroup', new Auth().m,async ctx => {
    const { article_id,author_id} = ctx.query
    //校验数据
    CompanionDetails(article_id)
    CompanionDetails(author_id)
    //用户Id
    const userId =ctx.auth.uid;
    let index = null;
    //查看是否对应的结伴
    const companionData = await modelCompanion.findOne(
        { article_id: article_id }).lean()
    if(!companionData && userId === author_id) {
        index = '001';
    }
    else if(!companionData && userId !== author_id){
        index = '002';
    }
    else{
        index = '003';
    }
    ctx.send('SUCCESS', 200, index)
})
module.exports = router.routes()