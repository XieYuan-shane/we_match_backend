// websocket.js
const WebSocket = require('ws');
const client = require('../redis/index.js'); // 引入Redis客户端实例
const {
    modelChatPrivate,
    modelChatGroup,
    modelCompanion,
    modelUser
} = require('../../models/collection.js')
const mongoose = require('mongoose')
// 使用Map来存储活跃的连接，键是receiverId，值是WebSocket实例
const clients = new Map();
// 反向映射，从WebSocket实例到用户ID
const wsToUserId = new Map();
let activeChatRooms = []; // 存储有活动的聊天室或私聊的Redis keys
// 假设传入的wss是从外部创建的WebSocket.Server实例
module.exports = function setupWebSocketServer(wss) {
 wss.on('connection', function connection(ws) {
    ws.on('message',async function incoming(message) {
        // 尝试解析接收到的消息为JSON
        const data = JSON.parse(message);
        console.log(data)
      // 检查消息是否仅包含一个userId
      if (data && typeof data === 'string' ) {
        // 将这个userId与当前的WebSocket连接关联
            clients.set(data, ws);
            wsToUserId.set(ws, data); // 添加反向映射
      }
    //发给一个小组
      else if (data.receiverId == ""){
        try {           
            // 从Redis缓存中获取群组参与者
            let participants = [];
            const participantsKey = `groupParticipants:${data.activityId}`;
            
            let participants_str = await client.lRange(participantsKey, 0, -1);
            if (participants_str.length === 0) {
              // 如果Redis中没有，从数据库查询
              participants = fetchAndUpdateParticipants(data.activityId,participantsKey)
            }
            else{
              participants = participants_str.map(participantStr => JSON.parse(participantStr));
            }
           // 向在线的群组成员发送消息
          participants.forEach(participantId => {
            if(participantId.user_id != data.userid){
              const participantSocket = clients.get(participantId.user_id);
              if (participantSocket) {
                participantSocket.send(JSON.stringify(data));
              }
            }
        }) 
            //存储消息到Redis或数据库
            // 尝试从Redis中获取群组聊天记录
            const counterKey = `messageCounter:${data.activityId}`;
            const messagesKey = `groupMessages:${data.activityId}`;
            const messages = await client.lRange(messagesKey, 0, -1);
            //redis中没有存储的消息记录
            if(messages.length === 0){
              const group = await modelChatGroup.findOne({ activityId: data.activityId });
                if (group && group.messages.length > 0) {
                  //加入缓存,25个小时
                    client.set(messagesKey,JSON.stringify(group.messages))
                    client.expire(messagesKey,25 * 60 * 60)
                    //加入消息计数器
                    client.set(counterKey,0)
                    client.expire(counterKey,25 * 60 * 60)
                    groupChatList.push(message.activityId)
                }
            }
            //存入redis
            saveGroupMessageToRedis(data,counterKey,messagesKey)
            }
         catch (error) {
          console.error('Error handling group message:', error);
        }
    }

    //私发消息
     else if (data.receiverId && data.receiverId !== "") {
      // 构造唯一的 Redis key，保证ID较小者总是在前
      const participants = [data.userid, data.receiverId].sort();
        const messageKey = `privateMessages:${participants[0]}:${participants[1]}`;
        const counterKey = `privateMessageCounter:${participants[0]}:${participants[1]}`;
        const receiverSocket = clients.get(data.receiverId);
        //用户在线
        if (receiverSocket) {
            receiverSocket.send(JSON.stringify(data)); // 将原始消息发送给接收者
      } 
        //存储进redis
        savePrivateMessageToRedis(data,messageKey,counterKey)
        .then(() => console.log('消息已保存到 Redis'))
        .catch(err => console.error('保存消息到 Redis 出错:', err));
    }

    ws.on('close', () => {
        // 从clients Map中删除断开连接的客户端
        const userId = wsToUserId.get(ws); // 通过反向映射找到userId
        if (userId) {
            clients.delete(userId);
            wsToUserId.delete(ws); // 删除反向映射
        }
    });
  });
})}

async function savePrivateMessageToRedis(data,messageKey,counterKey){
  const receiveMessage = {
    senderId: data.userid,
    content: data.message,
    createdAt: data.time
}
    // 更新消息计数器和redis缓存
    client.incr(counterKey);
    client.rPush(messageKey,JSON.stringify(receiveMessage))
    // 添加此key到activeChatRooms列表中，如果尚未存在的话
  if (!activeChatRooms.includes(messageKey)) {
      activeChatRooms.push(messageKey);
  }
}

async function saveGroupMessageToRedis(data,counterKey,messagesKey){
  const receiveMessage = {
    senderId: data.userid,
    content: data.message,
    createdAt: data.time
}
  // 更新消息计数器和redis缓存
    client.incr(counterKey);
    client.rPush(messagesKey,JSON.stringify(receiveMessage))
    if (!activeChatRooms.includes(messagesKey)) {
      activeChatRooms.push(messagesKey);
  }
}
//查询参与者
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
  const userIds = participants.map(participant => participant.user_id);
  return userIds;
}
//同步到数据库
async function syncMessagesToDatabase() {
  const tasks = activeChatRooms.map(async key => {
    const isGroup = key.startsWith("groupMessages:");
    const isPrivate = key.startsWith("privateMessages:");
    const counterKey = isGroup ? `messageCounter:${key.split(':')[1]}` : `privateMessageCounter:${key.split(':')[2]}:${key.split(':')[3]}`;
    const messageCount = await client.get(counterKey); // 这里改为await
    if (messageCount === 0) {
      client.del(key);
      client.del(counterKey);
    } else {
      // 重置计数器并延长Redis记录的生命周期
      client.set(counterKey, 0);
      client.expire(key, 25 * 60 * 60);
      const messages = await client.lRange(key, -messageCount, -1);
      if (isGroup) {
        const activityId = key.split(':')[1];
        syncNewMessagesToDB(activityId, messages.map(msg => JSON.parse(msg)));
      } else if (isPrivate) {
        // 这是正确的切割方法，直接从key中获取senderId和receiverId
        const participants = key.split(':');
        const senderId = participants[1];
        const receiverId = participants[2];
        syncNewMessagesToDBPrivate(senderId, receiverId, messages.map(msg => JSON.parse(msg)));
      }
    }
  });
  // 等待所有任务完成
  await Promise.all(tasks);
  activeChatRooms = [];
}


//同步群聊聊天记录
async function syncNewMessagesToDB(activityId,messages){
    // 转换 messages 数组中每个消息的 senderId 从字符串到 ObjectId
      try {
        const updated = await modelChatGroup.findOneAndUpdate(
          { activityId: activityId },
          { $push: { "messages": { $each: messages } } }, // 使用转换后的消息数组
          { new: true }
        );
    if (!updated) {
        console.log("更新失败")
        return; // 确保在发送响应后结束函数执行
    }

} catch (error) {
    console.log("异常")
}

}

//同时会创建私聊表的
async function syncNewMessagesToDBPrivate(senderId, receiverId, message){
  // 构造一个标识符来唯一确定一对参与者
  const participantsKey = [senderId, receiverId].sort().join('_');
  try {
       const participants = [senderId, receiverId].sort();
        let chat = await modelChatPrivate.findOne({participantA: participants[0], participantB: participants[1]}).exec();
      if (!chat) {
          // 如果没有找到现有私聊表，则获取参与者信息并创建新聊天记录
          const userA = await modelUser.findOne({uid: senderId}).exec();
          const userB = await modelUser.findOne({uid: receiverId}).exec();

          chat = await modelChatPrivate.create({
              participantA: participants[0],
              participantB: participants[1],
              messages: message, // 包含当前消息
              // 这里假设你希望存储更多关于参与者的信息
              nickNameA: userA.nickname,
              nickNameB: userB.nickname,
              avatarUrlA: userA.avatarUrl,
              avatarUrlB: userB.avatarUrl,
          });
      } else {
          // 如果找到了现有的聊天记录，就更新它
          chat = await modelChatPrivate.findOneAndUpdate(
              { _id: chat._id },
              { $push: { "messages": { $each: message } } },
              { new: true }
          );
      }
  } catch (error) {
      console.error('Error updating or creating private chat record:', error);
  }
}

// 设置定时任务，例如使用node-cron
const cron = require('node-cron');
//每天四点执行
cron.schedule('0 0 4 * * *', async () => {
  console.log('Running scheduled task: 同步聊天记录');
  await syncMessagesToDatabase();
}, {
  scheduled: true,
  timezone: "Asia/Shanghai"
});

