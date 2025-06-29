import { sendEmail } from "../utils/helper";

export const sendLoginInstructionsEmail = async (email: string, name: string, username: string, password: string) => {
  await sendEmail({
    to: email,
    subject: "Welcome to StockTrack",
    text: `Hi ${name},\n\nYour account has been created.\nUsername: ${username}\nPassword: ${password}\n\nPlease log in and change your password.`,
  });
};
