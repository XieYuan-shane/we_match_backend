// // redisClient.js
const redis = require('redis');
const account = require('../../config/Account')
// 创建Redis客户端实例
const client = redis.createClient({
  url: account.REDIS_URL // 更改为你的Redis服务器的URL
});

client.on('error', (err) => {
  console.error('Redis Client Error', err);
});

// 连接到Redis服务器
client.connect().catch((err) => {
  console.error('Redis connect error', err);
});

module.exports = client;
