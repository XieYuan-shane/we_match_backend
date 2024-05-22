const {
    modelChatPrivate,
    modelChatGroup,
    modelCompanion,
    modelSignup,
    modelUser
} = require('@/models/collection')
const mongoose = require('mongoose')
const { looKup, looKupCompanion } = require('@/config/lookup')
const router = require('@koa/router')()
const { gentoken } = require('@/token/jwt')
const { Auth } = require('@/token/auth')
const {
    getGroupMessage,
    getPrivateMessage,
    CompanionDetails,
    makePrivateMessage
} = require('@/config/valiData')
const client = require('../redis/index.js');

router.get("/getGroupMessage",async ctx => {
    // 获取groupId和userId
    const { groupId, userId } = ctx.query;
    //数据校验
    getGroupMessage(groupId,userId)
    // 尝试从Redis中获取群组聊天记录
    const messagesKey = `groupMessages:${groupId}`;
    let messages = await client.lRange(messagesKey, 0, -1);
    // 如果Redis中没有聊天记录，则查询数据库
    if (messages.length === 0) {
        const group = await modelChatGroup.findOne({ activityId: groupId }).exec();
    if (group && group.messages.length > 0) {
        messages = group.messages;
        // 将消息存入Redis
        messages.forEach(message => {
            client.rPush(messagesKey, JSON.stringify(message));
         });
    }
  } else {
    // 将字符串消息反序列化
     messages = messages.map(message => JSON.parse(message));
  }
  ctx.send("success",200,messages)
});

router.get("/getPrivateMessage",async ctx => {
    // 获取senderId和receiveId
    const { senderId, receiveId } = ctx.query;

    // 校验
    makePrivateMessage(senderId, receiveId);

    // 构造唯一的Redis key，保证ID较小者总是在前
    const participants = [senderId, receiveId].sort();
    const messageKey = `privateMessages:${participants[0]}:${participants[1]}`;

    let messages = await client.lRange(messageKey, 0, -1);
    if (messages.length === 0) {
        let group = await modelChatPrivate.findOne({participantA: participants[0], participantB: participants[1]}).exec();
        if (!group) {
            // 获取参与者信息
            const userA = await modelUser.findOne({uid:participants[0]}).exec();
            const userB = await modelUser.findOne({uid:participants[1]}).exec();

            // 创建新的聊天组
            group = await modelChatPrivate.create({
                participantA: participants[0],
                participantB: participants[1],
                nickNameA: userA.nickname, // 假设modelUser有nickname字段
                nickNameB: userB.nickname, // 假设modelUser有nickname字段
                avatarUrlA: userA.avatarUrl, // 假设modelUser有avatarUrl字段
                avatarUrlB: userB.avatarUrl, // 假设modelUser有avatarUrl字段
                messages: [] // 初始时没有消息
            });

            // 此时，messages数组为空
            messages = [];
        } else {
            // 如果找到了group，但Redis中没有消息，尝试从数据库加载消息
            messages = group.messages;
            if (messages.length > 0) {
                // 将消息存入Redis并设置过期时间
                await client.set(messageKey, JSON.stringify(messages));
                await client.expire(messageKey, 7200); // 设置2小时的过期时间
            }
        }
        
    } else {
        // 如果Redis中有消息，直接返回
        // 需要将字符串消息转换回对象形式
        messages = messages.map(message => JSON.parse(message));
    }
    ctx.send("success", 200, messages);
});
    

//保存私聊记录
router.post("/storePrivateMessage", async ctx => {
    const { senderId, receiverId, message, activityId } = ctx.request.body;

    try {
        const updated = await PrivateChat.findOneAndUpdate(
            { activityId: activityId, participants: { $all: [senderId, receiverId] } },
            { $set: { "messages": message } },
            { new: true }
        );

        ctx.send("success",200, { message: '更新成功' })
    } catch (error) {
        ctx.send('error', 500, { message: '服务器错误' })
    }
});
//加入群组
router.post("/joinGroup", async ctx => {
    const { groupId, userId } = ctx.request.body;

    try {
        const updated = await modelChatGroup.findByIdAndUpdate(
            groupId,
            { $addToSet: { participants: userId } }, // 使用$addToSet确保用户ID唯一
            { new: true }
        );

        if (!updated) {
            ctx.send('error', 404, { message: '群组不存在' })
        }

        ctx.send("success",200,{ message: '加入群组成功' })
    } catch (error) {
        ctx.send('error', 500, { message: '服务器错误' })
    }
});
//退出群聊
router.post("/leaveGroup", async ctx => {
    const { groupId, userId } = ctx.request.body;

    try {
        const updated = await modelChatGroup.findByIdAndUpdate(
            groupId,
            { $pull: { participants: userId } }, // 使用$pull移除用户ID
            { new: true }
        );

        if (!updated) {
            ctx.send('error', 404, { message: '群组不存在' })
        }

        ctx.send("success",200,{ message: '退出群组成功' })
    } catch (error) {
        ctx.send('error', 500, { message: '服务器错误' })
    }
});
//获取用户头像以及昵称，id等
router.get('/chatMember', new Auth().m,async ctx => {
    const { id } = ctx.query
    CompanionDetails(id)
    //redis的key
    const participantsKey = `groupParticipants:${id}`;
    let participants = await client.lRange(participantsKey, 0, -1);
    // 如果Redis中没有参与者信息，则查询数据库并更新Redis
  if (participants.length === 0) {
    const res = await fetchAndUpdateParticipants(id, participantsKey);
    ctx.send('SUCCESS', 200, res); // 注意，这里发送的应该是反序列化后的对象数组
}
else{
        // 将从Redis取出的每个字符串反序列化为对象
        const participant_processed = participants.map(participantStr => JSON.parse(participantStr));
	console.log("用户的消息是"+JSON.stringify(participant_processed))
        ctx.send('SUCCESS', 200, participant_processed); // 注意，这里发送的应该是反序列化后的对象数组
}
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

module.exports = router.routes()


