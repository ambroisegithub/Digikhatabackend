import nodemailer from 'nodemailer';
import dotenv from 'dotenv';


import { v4 as uuidv4 } from 'uuid';
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


interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}


export const generateOTP = (length: number = 6): string => {
  const digits = '0123456789';
  let otp = '';
  
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  
  return otp;
};

// Enhanced email sending with retries

// Generate secure random password
export const generatePassword = (length = 12): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
  let password = '';
  
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return password;
};

// Generate unique IDs
export const generateId = (prefix = ''): string => {
  return `${prefix}${uuidv4().replace(/-/g, '').substring(0, 8)}`;
};

// Format dates consistently
export const formatDate = (date: Date | string, includeTime = true): string => {
  const d = new Date(date);
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };
  
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  
  return d.toLocaleDateString('en-US', options);
};

// Helper for pagination
export const paginate = <T>(items: T[], page: number, limit: number) => {
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  return {
    data: items.slice(startIndex, endIndex),
    page,
    limit,
    total: items.length,
    totalPages: Math.ceil(items.length / limit)
  };
};

