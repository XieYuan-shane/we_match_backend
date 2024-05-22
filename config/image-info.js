const axios = require('axios')
const sizeOf = require('image-size')

const imageInfor = function (imgUrl) {
    return new Promise(async (resolve, reject) => {
        try {
            const res = await axios.get(imgUrl, { responseType: 'arraybuffer' })
            const buffer = Buffer.from(res.data, 'binary')
            const size = sizeOf(buffer)
            resolve({ width: size.width, height: size.height })
        } catch (error) {
            reject(error)
        }
    })
}

module.exports = imageInfor