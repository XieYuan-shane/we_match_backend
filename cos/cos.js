const multer = require('@koa/multer');
const COS = require('cos-nodejs-sdk-v5');
const account = require('@/config/Account')

//永久密钥
//注意访问权限设置为公有，否则一个小时后链接会失效
const cos = new COS({
    SecretId: account.QQ_SECRETID,
    SecretKey: account.QQ_SECRRTKEY,
    FileParallelLimit: 6,
    //分块并发上传，提高上传速率
    ChunkParallelLimit: 6,
    Protocol: 'https',
    //是否全球加速域名(注意这里选择了true的话要在腾讯云开启全局加速)
    UseAccelerate: true
});


// 上传图片到服务器端
const storage = multer.diskStorage({
    filename: (req, file, cb) => {
        //为了避免图片名出现相同的冲突，用毫秒时间戳进行拼接
        let fileFormat = (file.originalname).split(".")
        let newCode = `${new Date().getTime()}${"."}${fileFormat[fileFormat.length - 1]}`
        cb(null, newCode)
    }
})

const upload = multer({ storage })

// 上传到腾讯云
const cosUpdate = (value) => {
    return new Promise((resolve, reject) => {
        const resFile = []
        const files = value.map(item => {
            return {
                Bucket: account.QQ_BUCKET, /* 填入您自己的存储桶，必须字段 */
                Region: account.QQ_REGION,  /* 存储桶所在地域，例如 ap-beijing，必须字段 */
                Key: `${account.QQ_FOLDER}${item.filename}`,  /* 存储在桶里的对象键（例如1.jpg，a/b/test.txt），必须字段 */
                FilePath: item.path,//文件在本地的路径
            }
        })
        cos.uploadFiles({ files })
            .then(res => {
                console.log(res.files);
                res.files.forEach(item => resFile.push(`https://${item.data.Location}`))
                resolve(resFile)
            })
            .catch(err => {
                reject(err)
            })
    })
}

module.exports = {
    upload, cosUpdate
}