import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


export const getDateRange = (type: "daily" | "weekly") => {
  const now = new Date()
  let startDate: Date
  let endDate: Date

  if (type === "daily") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  } else if (type === "weekly") {
    const dayOfWeek = now.getDay() // 0 (Sun) - 6 (Sat)
    startDate = new Date(now)
    startDate.setDate(now.getDate() - dayOfWeek)
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(now)
    endDate.setDate(now.getDate() + (6 - dayOfWeek))
    endDate.setHours(23, 59, 59, 999)
  } else {
    throw new Error("Invalid date range type")
  }

  return { startDate, endDate }
}
// ...existing code...

export const generateOTP = (length: number = 6): string => {
  const digits = '0123456789';
  let otp = '';
  
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  
  return otp;
};

export const sendEmail = async (options: EmailOptions): Promise<any> => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    };

    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
  }
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const generateRandomString = (length: number = 12): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
};

export const safeJSONParse = (json: string): any => {
  try {
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
};

export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const sanitizeString = (str: string): string => {
  return str.replace(/[^a-zA-Z0-9 ]/g, '');
};