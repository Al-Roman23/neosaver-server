// This File Handles Imgbb Image Uploads
const axios = require("axios");
const FormData = require("form-data");
const logger = require("./logger");

async function uploadImageToImgBB(fileBuffer, originalName) {
  try {
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
      throw new Error("IMGBB_API_KEY Is Missing In Environment Variables!");
    }

    const form = new FormData();
    form.append("image", fileBuffer, {
      filename: originalName,
    });

    const response = await axios.post(`https://api.imgbb.com/1/upload?key=${apiKey}`, form, {
      headers: {
        ...form.getHeaders(),
      },
    });

    if (response.data && response.data.success) {
      return response.data.data.url;
    } else {
      throw new Error("ImgBB Upload Failed!");
    }
  } catch (error) {
    logger.error({ error: error.message }, "ImgBB Image Upload Failed!");
    throw new Error("Failed To Upload Image To ImgBB.");
  }
}

module.exports = { uploadImageToImgBB };
