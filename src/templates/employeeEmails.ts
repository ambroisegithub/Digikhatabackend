import { transporter } from '../utils/helper';

const COLOR_PALETTE = {
  PRIMARY: '#4A90E2',   // Digi Khata blue
  SECONDARY: '#2E7D32', // Green
  ACCENT: '#FF6D00',    // Orange
  NEUTRAL_DARK: '#333333',
  NEUTRAL_LIGHT: '#F5F5F5',
  WHITE: '#FFFFFF'
};

export const EmployeeWelcomeEmail = (
  employeeName: string,
  email: string,
  tempPassword: string
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Digi Khata App</title>
    <style>
        body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: ${COLOR_PALETTE.NEUTRAL_DARK};
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: ${COLOR_PALETTE.WHITE};
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .header {
            background: ${COLOR_PALETTE.PRIMARY};
            padding: 30px 20px;
            text-align: center;
            color: ${COLOR_PALETTE.WHITE};
        }
        .content {
            padding: 30px;
        }
        .credentials {
            background: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            padding: 20px;
            border-radius: 6px;
            margin: 20px 0;
        }
        .button {
            display: inline-block;
            padding: 12px 24px;
            background: ${COLOR_PALETTE.ACCENT};
            color: ${COLOR_PALETTE.WHITE};
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            margin: 15px 0;
        }
        .footer {
            text-align: center;
            padding: 20px;
            font-size: 12px;
            color: ${COLOR_PALETTE.NEUTRAL_DARK};
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to Digi Khata App</h1>
        </div>
        <div class="content">
            <p>Dear ${employeeName},</p>
            <p>Your account has been created by the admin. Please use the following credentials to log in:</p>
            
            <div class="credentials">
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Temporary Password:</strong> ${tempPassword}</p>
            </div>
            
            <p>For security reasons, you'll be required to change your password on first login.</p>            
            <p>If you have any questions, please contact your admin.</p>
            <p>Best regards,<br>The Digi Khata Team</p>
        </div>
        <div class="footer">
            © ${new Date().getFullYear()} Digi Khata App. All rights reserved.
        </div>
    </div>
</body>
</html>
`;

export const PasswordResetEmail = (
  employeeName: string,
  otp: string
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset OTP</title>
    <style>
        /* Same styling as above with minor adjustments */
        .otp-code {
            font-size: 24px;
            letter-spacing: 5px;
            color: ${COLOR_PALETTE.PRIMARY};
            font-weight: bold;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Password Reset Request</h1>
        </div>
        <div class="content">
            <p>Dear ${employeeName},</p>
            <p>You have requested to reset your password. Here is your OTP:</p>
            
            <div class="otp-code">${otp}</div>
            
            <p>This OTP is valid for 10 minutes. Please do not share it with anyone.</p>
            
            <p>If you didn't request this, please contact your admin immediately.</p>
            <p>Best regards,<br>The Digi Khata Team</p>
        </div>
        <div class="footer">
            © ${new Date().getFullYear()} Digi Khata App. All rights reserved.
        </div>
    </div>
</body>
</html>
`;

export const sendEmployeeWelcomeEmail = async (
  email: string,
  name: string,
  tempPassword: string
) => {
  const mailOptions = {
    from: process.env.EMAIL_USER || 'Digi Khata <noreply@digikhata.com>',
    to: email,
    subject: 'Welcome to Digi Khata - Your Account Details',
    html: EmployeeWelcomeEmail(name, email, tempPassword)
  };

  return transporter.sendMail(mailOptions);
};

export const sendPasswordResetEmail = async (
  email: string,
  name: string,
  otp: string
) => {
  const mailOptions = {
    from: process.env.EMAIL_USER || 'Digi Khata <noreply@digikhata.com>',
    to: email,
    subject: 'Digi Khata - Password Reset OTP',
    html: PasswordResetEmail(name, otp)
  };

  return transporter.sendMail(mailOptions);
};