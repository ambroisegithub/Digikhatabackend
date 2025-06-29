import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import { Response } from "express";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARYNAME,
  api_key: process.env.APIKEY,
  api_secret: process.env.APISECRET,
});

export const UploadToCloud = async (file: Express.Multer.File, res: Response) => {
  try {
    let uploadResponse;

    if (file.mimetype.startsWith("image/")) {
      uploadResponse = await cloudinary.uploader.upload(file.path, {
        folder: "images/",
        use_filename: true
      });
    } else if (file.mimetype.startsWith("audio/")) {
      uploadResponse = await cloudinary.uploader.upload(file.path, {
        folder: "audio/",
        resource_type: "video",  
        use_filename: true
      });
    } else if (file.mimetype.startsWith("video/")) {
      uploadResponse = await cloudinary.uploader.upload(file.path, {
        folder: "video/",
        resource_type: "video",
        use_filename: true
      });
    } else {
      throw new Error("Unsupported file type");
    }

    return uploadResponse;
  } catch (error: any) {
    return res.status(400).json({
      message: error.message || "Error uploading to Cloudinary",
    });
  }
};
