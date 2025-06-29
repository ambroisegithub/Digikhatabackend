// @ts-nocheck

import multer from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";

const allowedImageExtensions = [
  ".jpg", ".jpeg", ".png", ".gif", ".tif", ".webp", ".bmp", 
  ".svg", ".ico", ".heic", ".tiff"
];

const allowedAudioExtensions = [
  ".mp3", ".wav", ".flac", ".aac", ".ogg", 
  ".wma", ".m4a", ".opus", ".aiff", ".alac"
];

const allowedVideoExtensions = [
  ".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", 
  ".wmv", ".m4v", ".3gp", ".mpg", ".mpeg"
];

const ensureDirectoryExists = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true }); 
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = "uploads/";

    if (file.mimetype.startsWith("image/")) {
      folder = "uploads/images";
    } else if (file.mimetype.startsWith("audio/")) {
      folder = "uploads/audio";
    } else if (file.mimetype.startsWith("video/")) {
      folder = "uploads/video";
    }

    ensureDirectoryExists(folder); 
    cb(null, folder); 
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);  
  }
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (
    allowedImageExtensions.includes(ext) ||
    allowedAudioExtensions.includes(ext) ||
    allowedVideoExtensions.includes(ext)
  ) {
    return cb(null, true); 
  }

  const error = new Error("Invalid file type");
  cb(error, false);  
};

const upload = multer({ storage, fileFilter });

export default upload;
