// 公用连表
const {
    modelUser,
    modelArticle,
    modelLike,
    modelCollection,
    modelComment,
    modelSignup,
    modelCompanion
} = require('../models/collection')

//公用连表查询
const looKup = () => {
    const model_user = {//用户表
        $lookup: {
            from: modelUser.collection.name,
            localField: 'author_uid',//author_uid = uid
            foreignField: 'uid',
            as: 'author_data'
        }
    };
    const model_like = {//点赞表
        $lookup: {
            from: modelLike.collection.name,
            localField: '_id',
            foreignField: 'article_id',
            as: 'likes' //计算点赞数量
        }
    };
    const model_comment = {//评论表
        $lookup: {
            from: modelComment.collection.name,
            localField: '_id',
            foreignField: 'article_id',
            as: 'comments'//计算评论数量
        }
    };
    const model_collect = {//收藏表
        $lookup: {
            from: modelCollection.collection.name,
            localField: '_id',
            foreignField: 'article_id',
            as: 'collections'//计算收藏数量
        }
    };
    //返回前端的瀑布流
    const project = {//返给前端的瀑布流数据
        $project: {
            '_id': 1,  //瀑布流的id
            'title': 1, 
            'cover_image': 1, 
            'address': 1, 
            'fileType': 1, 
            'author_data.avatarUrl': 1, //作者头像
            'author_data.nickname': 1, //作者昵称
            'likes': { $size: '$likes' }
        }
    }
    return {
        model_user,
        model_like,
        model_comment,
        model_collect,
        project
    }
}

// 四个推荐文章的公用连表
const looKupRecommend = () => {
    const model_Article = {//游记表
        $lookup: {
            from: modelArticle.collection.name,
            localField: 'article_id',
            foreignField: '_id',
            as: 'articleData'
        }
    };
    const model_reco_user = {//用户表
        $lookup: {
            from: modelUser.collection.name,
            localField: 'articleData.author_uid',
            foreignField: 'uid',
            as: 'userData'
        }
    }
    return {
        model_Article,
        model_reco_user
    }
}

// 关注页面：获取用户关注的作者以及作者的游记
const looKupConcern = (_id) => {
    const model_like = {//点赞表
        $lookup: {
            from: modelLike.collection.name,
            localField: _id,
            foreignField: 'article_id',
            as: 'likes'
        }
    };
    const model_comment = {//评论表
        $lookup: {
            from: modelComment.collection.name,
            localField: _id,
            foreignField: 'article_id',
            as: 'comments'
        }
    };
    const model_collect = {//收藏表
        $lookup: {
            from: modelCollection.collection.name,
            localField: _id,
            foreignField: 'article_id',
            as: 'collections'
        }
    };
    return {
        model_like,
        model_comment,
        model_collect
    }
}

// 结伴：首页筛选活动
const looKupCompanion = () => {
    const model_user = {//用户表
        $lookup: {
            from: modelUser.collection.name,
            localField: 'uid',
            foreignField: 'uid',
            as: 'author_data'
        }
    };
    const model_signup = {//报名表
        $lookup: {
            from: modelSignup.collection.name,
            localField: '_id',
            foreignField: 'signup_id',
            as: 'signups'
        }
    };
    const model_companion = {//活动表
        $lookup: {
            from: modelCompanion.collection.name,
            localField: 'signup_id',
            foreignField: '_id',
            as: 'my_companion'
        }
    };

    return {
        model_signup,
        model_user,
        model_companion
    }
}

module.exports = {
    looKup,
    looKupRecommend,
    looKupConcern,
    looKupCompanion
}