const Koa = require('koa')
const app = new Koa()
const json = require('koa-json')//用于将http响应的数据转换为json格式
const bodyParser = require('koa-bodyparser')//解析http请求的消息体
const router = require('@koa/router')()
const cors = require('@koa/cors')//允许跨域
const mongoose = require('mongoose')
const { addAliases } = require('module-alias')

require('./routes/websocket/websocket'); // 引入定时任务配置
require('./routes/recommend/recommend'); //引入定时任务
// 配置别名
addAliases({
    '@': __dirname
})
// 数据库地址
const { BASE_URL } = require('@/config/Account')
// 统一返回给前端的接口数据格式:中间件
const responseHandler = require('@/config/result')
// 捕获错误的中间件
const errorHandler = require('@/config/abnormal')

app.use(cors())
app.use(json())
app.use(bodyParser())
app.use(responseHandler)
app.use(errorHandler)

//连接数据库
mongoose.connect(BASE_URL)
    .then(res => {
        console.log('数据库连接成功');
    })
    .catch(err => {
        console.log(err);
        console.log('数据库连接失败！！！');
    })
// const chat = require('@/routes/websocket/websocket')
//--------------接口小程序端----------------
// 登录注册用户账号
const login = require('@/routes/user/index')
// 文章
const article = require('@/routes/article/index')
// 首页
const home = require('@/routes/home/index')
// 搜索
const search = require('@/routes/search/index')
// 结伴
const companion = require('@/routes/companion/index')
//聊天
const chat = require('@/routes/chat/chat')

//--------------接口后台管理端----------------
const pcapi = require('@/routes/pc-admin/index')
// 数据分析
const analysis = require('@/routes/pc-data-analysis/index')

router.use('/apif',chat)
router.use('/apif', login)
router.use('/apif', article)
router.use('/apif', pcapi)
router.use('/apif', home)
router.use('/apif', search)
router.use('/apif', companion)
router.use('/apif', analysis)

app.use(router.routes()).use(router.allowedMethods())

// // 使用HTTP服务器监听8900端口，而不是Koa应用直接监听
app.listen(8900)
console.log('端口启动成功:8900');

const http = require('http');
const WebSocket = require('ws');

// 创建独立的HTTP服务器用于WebSocket
const wsServer = http.createServer();
const wss = new WebSocket.Server({ server: wsServer });
const setupWebSocketServer = require('@/routes/websocket/websocket');


// 将WebSocket.Server实例传给websocket.js中的函数
setupWebSocketServer(wss);


// WebSocket服务器监听不同的端口，例如8901
wsServer.listen(4666, () => {
  console.log('WebSocket服务启动成功，监听于4666端口');
});
