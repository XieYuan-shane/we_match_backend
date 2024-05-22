const result = require('./handle')

// 校验为undefined
function unDefined(arrAy) {
    arrAy.forEach(item => {
        if (item === undefined) {
            throw new result('参数填写错误,请检查字段名和必填项', 400)
        }
    })
}

// 校验为空数据
function nullValue(arrAy) {
    arrAy.forEach(item => {
        if (typeof (item.value) == 'string') {
            if (item.value.trim() === '') {
                throw new result(item.tips, 422)
            }
        }
    })
}

// 密码校验：6-20位数字和字母结合
const passwordver = /^(?![\d]+$)(?![a-zA-Z]+$)(?![^\da-zA-Z]+$).{6,20}$/
// 登录校验
const Login = (email, password) => {
    unDefined([email, password])
    nullValue([
        { value: email, 'tips': '请输入邮箱' },
        { value: password, 'tips': '请输入密码' }
    ])
   // 校验邮箱号码格式
   const regEmail=/^([a-zA-Z0-9]+[_|\_|\.]?)*[a-zA-Z0-9]+@um\.edu\.mo$/ //验证邮箱正则
   if(!regEmail.test(email)){
       throw new result('请输入正确的邮箱格式（以@um.edu.mo结尾的邮箱）', 422)
   }
}
// 发送验证码校验
const Vercode = (emailAddress) => {
    unDefined([emailAddress])
    nullValue([
        { value:emailAddress, 'tips': '请输入邮箱号' }
    ])
    // 校验邮箱号码格式
    const regEmail=/^([a-zA-Z0-9]+[_|\_|\.]?)*[a-zA-Z0-9]+@um\.edu\.mo$/ //验证邮箱正则
    if(!regEmail.test(emailAddress)){
        throw new result('请输入正确的邮箱格式（以@um.edu.mo结尾的邮箱）', 422)
    }
}

// 小程序端：邮箱，验证码登录
const Emailregistration = (email, code) => {
    unDefined([email, code])
    nullValue([
        { value: email, 'tips': '请输入邮箱' },
        { value: code, 'tips': '请输入验证码' }
    ])
    // 校验邮箱号码格式
    const regEmail=/^([a-zA-Z0-9]+[_|\_|\.]?)*[a-zA-Z0-9]+@um\.edu\.mo$/ //验证邮箱正则
    if(!regEmail.test(email)){
        throw new result('请输入正确的邮箱格式（以@um.edu.mo结尾的邮箱）', 422)
    }
}
// 小程序端，设置密码
const Uploadpassword = (email, code, password) => {
    unDefined([email, code, password])
    nullValue([
        { value: email, 'tips': '请输入邮箱号' },
        { value: code, 'tips': '请输入验证码' },
        { value: password, 'tips': '请输入密码' }
    ])
     // 校验邮箱号码格式
     const regEmail=/^([a-zA-Z0-9]+[_|\_|\.]?)*[a-zA-Z0-9]+@um\.edu\.mo$/ //验证邮箱正则
     if(!regEmail.test(email)){
         throw new result('请输入正确的邮箱格式（以@um.edu.mo结尾的邮箱）', 422)
     }
    // 校验密码格式
    if (!passwordver.test(password)) {
        throw new result('密码需由6-20位数字和字母结合', 422)
    }
}

// 编辑个人资料
const Modifytheuser = (nickname, gender, birthday, college, avatarUrl, backdrop) => {
    unDefined([nickname, gender, birthday, college, avatarUrl, backdrop])
    nullValue([
        { value: nickname, 'tips': '请填写昵称' },
        { value: gender, 'tips': '请选择性别' },
        { value: birthday, 'tips': '请选择出生日期' },
        { value: college, 'tips': '请选择居住书院' },
        { value: avatarUrl, 'tips': '请上传头像' },
        { value: backdrop, 'tips': '请上传背景' }
    ])
}

// 分析文章关键词
const Articlekeyword = (text) => {
    unDefined([text])
}

// 发布文章:图片类型
const Articlepblish = (title, content, image,address,tag,category) => {
    unDefined([title, content, image,address,tag,category])
    nullValue([
        { value: title, 'tips': '请填写标题' },
        { value: content, 'tips': '请输分享内容' },
        { value: image, 'tips': '请上传图片' },
        { value: address, 'tips': '请输入活动地址' },
        { value: tag, 'tips': '请添加标签' },
        { value: category, 'tips': '请添加文章分类' }
    ])
    if (!Array.isArray(image)) {
        throw new result('image字段应为数组类型', 422)
    }
    if (image.length === 0) {
        throw new result('请上传图片', 422)
    }
    if (!Array.isArray(tag)) {
        throw new result('tag字段应为数组类型', 422)
    }
    if (tag.length === 0) {
        throw new result('请添加标签', 422)
    }
}

// 发布内容:视频类型
const ArticlepblishVideo = (title, content,  address, category,
    tag, videoPoster, videoUrl, videoWidth, videoHeight) => {
    unDefined([title, content,  address, category,
        tag, videoPoster, videoUrl, videoWidth, videoHeight])
    nullValue([
        { value: title, 'tips': '请填写标题' },
        { value: content, 'tips': '请输入内容' },
        { value: address, 'tips': '请选择城市' },
        { value: tag, 'tips': '请添加标签' },
        { value: category, 'tips': '请添加种类' },
        { value: videoPoster, 'tips': '请上传封面图' },
        { value: videoUrl, 'tips': '请上传视频' },
        { value: videoWidth, 'tips': '缺少视频宽度' },
        { value: videoHeight, 'tips': '缺少视频高度' }
    ])
    if (!Array.isArray(tag)) {
        throw new result('tag字段应为数组类型', 422)
    }
    if (tag.length === 0) {
        throw new result('请添加标签', 422)
    }
}

// 注册账号：管理员端
const Adminregister = (mobile, password) => {
    unDefined([mobile, password])
    nullValue([
        { value: mobile, tips: '请输入手机号' },
        { value: password, tips: '请填写密码' }
    ])
    // 校验密码格式
    if (!passwordver.test(password)) {
        throw new result('密码需由6-20位数字和字母结合', 422)
    }
}

// 更新管理员头像，昵称
const ModifyuserInfor = (_id, avatarUrl, nickname) => {
    unDefined([_id, avatarUrl, nickname])
    nullValue([
        { value: _id, tips: '缺少_id' },
        { value: avatarUrl, tips: '请上传头像' },
        { value: nickname, tips: '请填写昵称' }
    ])
}

// 上传每日推荐
const Dailyrecom = (imageUrl, title, address, color) => {
    unDefined([imageUrl, title, address, color])
    nullValue([
        { value: imageUrl, tips: '请上传封面图' },
        { value: title, tips: '请填写标题' },
        { value: address, tips: '请选择地址' },
        { value: color, tips: '请选择颜色' }
    ])
}



// 获取每日推荐
const Resreturn = (page) => {
    unDefined([page])
    nullValue([
        { value: page, tips: '缺少分页page值' }
    ])
}

// 删除每日推荐
const CompanionDetails = (_id) => {
    unDefined([_id])
    nullValue([
        { value: _id, tips: '缺少_id值' }
    ])
}

// 提交四个推荐
const Uploadfourarticle = (imageUrl, article_id) => {
    unDefined([imageUrl, article_id])
    nullValue([
        { value: imageUrl, tips: '请上传图片' },
        { value: article_id, tips: '请选择一个文章关联' }
    ])
}

// 修改更新四个文章
const Modifyfourarticle = (_id, imageUrl, article_id) => {
    unDefined([_id, imageUrl, article_id])
    nullValue([
        { value: _id, tips: '缺少_id' },
        { value: imageUrl, tips: '请上传图片' },
        { value: article_id, tips: '请选择一个文章关联' }
    ])
}

// 用户评论文章
const Comment = (article_id, comment_content) => {
    unDefined([article_id, comment_content])
    nullValue([
        { value: article_id, tips: '缺少_id' },
        { value: comment_content, tips: '请填写评论内容' }
    ])
}
// 获取文章的评论数据
const Commentget = (article_id, page) => {
    unDefined([article_id, page])
    nullValue([
        { value: article_id, tips: '缺少_id' },
        { value: page, tips: '缺少分页值' }
    ])
}

// 关注接口
const Userconcern = (im_concerned_uid) => {
    unDefined([im_concerned_uid])
    nullValue([
        { value: im_concerned_uid, tips: '缺少作者uid' }
    ])
}

// 获取首页瀑布流文章
const Clssifyarticles = (keywords, page) => {
    unDefined([keywords, page])
    nullValue([
        { value: keywords, tips: '缺少分类查询值keywords' },
        { value: page, tips: '缺少分页page值' }
    ])
}

// 根据定位获取当地文章
const Localarticles = (page, address) => {
    unDefined([page, address])
    nullValue([
        { value: page, tips: '缺少分页page值' },
        { value: address, tips: '缺少地址address值' }
    ])
}

// 当地活动：按地址和文章分类关键词查询文章
const Addressqueryarticles = (address, keywords, page) => {
    unDefined([address, keywords, page])
    nullValue([
        { value: address, tips: '缺少地址address值' },
        { value: keywords, tips: '缺少查询keywords值' },
        { value: page, tips: '缺少分页page值' },
    ])
}

// 用户根据分类选择地址
const Chooseaddress = (type) => {
    unDefined([type])
    nullValue([
        { value: type, tips: '缺少type查询值' }
    ])
}

// 发起结伴
const InitiatingPartner = (
    description,
    image,
    full_address,
    companion_time,
    number_of_people) => {
    unDefined([
        description,
        image,
        full_address,
        companion_time,
        number_of_people])
    nullValue([
        { value: description, tips: '请填写描述' },
        { value: image, tips: '请上传图片' },
        { value: full_address, tips: '请选择目的地' },
        { value: companion_time, tips: '请选择结伴时间' },
        { value: number_of_people, tips: '请选择希望人数' }
    ])
    if (!Array.isArray(image)) {
        throw new result('image字段应为数组类型', 422)
    }
    if (image.length === 0) {
        throw new result('请上传图片', 422)
    }
}

// 报名结伴
const SignupPartner = (
    signup_id,
    contact_inform,
    gender,
    introduce) => {
    unDefined([
        signup_id,
        contact_inform,
        gender,
        introduce])
    nullValue([
        { value: signup_id, tips: '缺少_id' },
        { value: contact_inform, tips: '请填写联系方式' },
        { value: gender, tips: '请选择性别' },
        { value: introduce, tips: '请填写自我介绍' },
    ])
}

// 首页筛选活动
const CompanionQuery = (category, keyword, page) => {
    unDefined([category, keyword, page])
    nullValue([
        { value: category, tips: '缺少选择分类category查询值' },
        { value: keyword, tips: '缺少选择月份keyword查询值' },
        { value: page, tips: '缺少分页page值' },
    ])
}

//获取群聊信息
const getGroupMessage = (groupId,userId) => {
    unDefined([groupId,userId])
    nullValue([
        { value: groupId, tips: '缺少群组id' },
        { value: userId, tips: '缺少userId' },
    ])
}
//获取私聊信息
const getPrivateMessage = (senderId,receiveId,activityId) => {
    unDefined([senderId,receiveId,activityId])
    nullValue([
        { value: senderId, tips: '缺少id' },
        { value: receiveId, tips: '缺少Id' },
        { value: activityId, tips: '缺少activityId' },
    ])
}
//创建私聊表信息
const makePrivateMessage = (senderId,receiveId) => {
    unDefined([senderId,receiveId])
    nullValue([
        { value: senderId, tips: '缺少id' },
        { value: receiveId, tips: '缺少Id' }
    ])
}
const dropGroup = (activityId)=>{
    unDefined([activityId])
    nullValue([
        { value: activityId, tips: '缺少' }
    ])
}
module.exports = {
    Login,
    Vercode,
    Emailregistration,
    Uploadpassword,
    Modifytheuser,
    Articlekeyword,
    Articlepblish,
    ArticlepblishVideo,
    Adminregister,
    ModifyuserInfor,
    Dailyrecom,
    Resreturn,
    CompanionDetails,
    Uploadfourarticle,
    Modifyfourarticle,
    Comment,
    Commentget,
    Userconcern,
    Clssifyarticles,
    Localarticles,
    Addressqueryarticles,
    Chooseaddress,
    InitiatingPartner,
    SignupPartner,
    CompanionQuery,
    getGroupMessage,
    getPrivateMessage,
    makePrivateMessage,
    dropGroup
}