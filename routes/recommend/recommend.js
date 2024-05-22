const {
    modelUser,
    modelArticle,
    modelRecommendation
} = require('../../models/collection')
const client = require('../redis/index.js'); // 引入Redis客户端实例
//计算标签匹配度

async function calculateTagMatchScore(articleTags, userTags) {
    // 计算交集的大小
    const intersection = articleTags.filter(tag => userTags.includes(tag));
    // 计算标签匹配度分数
    const matchScore = intersection.length / articleTags.length;
    return matchScore;
}
//新鲜度（文章什么时候发出）
async function calculateFreshnessScore(articleTimeStamp) {
    const currentTime = Math.floor(Date.now() / 1000); // 当前时间戳（秒）
    const timeDiff = currentTime - articleTimeStamp; // 发布时间与当前时间的差值（秒）
    // 使用简单的衰减函数计算新鲜度分数，这里假设一周（604800秒）的时间衰减
    const freshnessScore = Math.exp(-timeDiff / 604800);
    return freshnessScore;
}
async function calculateInteractionScore(articleId) {
    
     const interactionsKey = `article:${articleId}:interactions`;
     const interactionsRedis = await client.hGetAll(interactionsKey);
     let likes;
     let comments;
     let collections;
    // 检查数据是否存在于 Redis
    if (!interactionsRedis || Object.keys(interactionsRedis).length === 0) {
         //不存在
         const res = await modelArticle.aggregate([
             { $match: { _id: new mongoose.Types.ObjectId(articleId) } },
             looKup().model_like,//连接点赞表，计算点赞数量
             looKup().model_collect,//连接收藏表，计算收藏数量
             looKup().model_comment,//连接评论表，计算评论数量
             {
                 $project: { 
                     "likes": { $size: '$likes' },//计算点赞数量
                     "comments": { $size: '$comments' },//计算评论数量
                     "collections": { $size: '$collections' },//计算收藏数量
                 }
                }
         ])
            likes = res[0].likes;
            comments = res[0].comments;
            collections = res[0].collections
            client.hSet(interactionsKey, "likes", likes);
            client.hSet(interactionsKey, "comments", comments);
            client.hSet(interactionsKey, "collections", collections);
            client.expire(interactionsKey, 3600); // 设置1小时过期时间
        }
        else{
            likes =  interactionsRedis.likes;
            comments = interactionsRedis.comments;
            collections = interactionsRedis.collections;
        }
    // 分别为点赞、评论、收藏设置权重
    const weights = { likes: 0.3, comments: 0.4, collections: 0.3 };

    // 计算总分，其中每部分乘以其相应的权重
    const totalScore = (likes * weights.likes) + (comments * weights.comments) + (collections * weights.collections);
    // 假设互动的最高阈值为100，这是一个假设值，可以根据实际情况调整
    // 用这个总分除以总分加上一个阈值（100）来正规化分数至0到1之间
    const interactionScore = totalScore / (totalScore + 100);
    return interactionScore;
}
//推荐算法
async function calculateScoresForAllUsers() {
    try {
        const users =  await modelUser.find(); // 获取所有用户
        const articles = await modelArticle.find(); // 获取所有文章

        for (const user of users) {
            let recommendations = [];
            for (const article of articles) {
                //两个标签数组
                const user_tages = user.my_tags;
                const article_tages = article.tag;
                const article_time_stamp = article.time_stamp;
                const tagMatchScore = await calculateTagMatchScore(article_tages,user_tages)
                const freshnessScore = await calculateFreshnessScore(article_time_stamp)
                const InteractionScore = await calculateInteractionScore(article._id)
                 // 定义权重并计算综合推荐分数
                 const weights = { tagMatch: 0.5, freshness: 0.3, interaction: 0.2 };
                 const recommendationScore = 
                     (tagMatchScore * weights.tagMatch) +
                     (freshnessScore * weights.freshness) +
                     (InteractionScore * weights.interaction);
 
                 recommendations.push({
                     articleId: article._id,
                     score: recommendationScore
                 });
                 // 选择分数最高的前十篇文章
                recommendations.sort((a, b) => b.score - a.score);
                recommendations = recommendations.slice(0, 10);
                // 将推荐列表和分数分别提取到数组中
                const recommendListId = recommendations.map(r => r.articleId);
                const recommendScore = recommendations.map(r => r.score);
                // 更新数据库中的推荐列表
                await modelRecommendation.findOneAndUpdate(
                { userId: user.uid }, // 确保 userId 的类型一致
                { 
                    userId: user.uid,
                    recommendListId: recommendListId,
                    recommendScore: recommendScore
                },
                { upsert: true, new: true }
            )
            }
        }
    } catch (error) {
        console.error("Failed to update recommendation lists", error);
    }
}
// 设置定时任务，例如使用node-cron
const cron = require('node-cron');
//每天三点半执行
cron.schedule('0 30 3 * * *', async () => {
    console.log('Running scheduled task: Calculate Scores for All Users at 3:30 AM');
    await calculateScoresForAllUsers();
}, {
    scheduled: true,
    timezone: "Asia/Shanghai"
});