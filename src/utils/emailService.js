import emailjs from 'emailjs-com';
import { EMAILJS_CONFIG } from '../config/emailConfig';

class EmailService {
  constructor() {
    emailjs.init(EMAILJS_CONFIG.publicKey);
  }

  generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendVerificationEmail(email, name, code) {
    try {
      const templateParams = {
        to_email: email,
        to_name: name,
        verification_code: code,
        from_name: 'CBDA Exam Simulator'
      };

      await emailjs.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templateId,
        templateParams
      );

      return { success: true };
    } catch (error) {
      console.error('Email send error:', error);
      return { success: false, error: error.message };
    }
  }

  storeVerificationCode(email, code) {
    const expiry = Date.now() + (15 * 60 * 1000); // 15 minutes
    localStorage.setItem(`verification_${email}`, JSON.stringify({ code, expiry }));
  }

  verifyCode(email, inputCode) {
    const stored = localStorage.getItem(`verification_${email}`);
    if (!stored) return false;

    const { code, expiry } = JSON.parse(stored);
    
    if (Date.now() > expiry) {
      localStorage.removeItem(`verification_${email}`);
      return false;
    }

    if (code === inputCode) {
      localStorage.removeItem(`verification_${email}`);
      return true;
    }

    return false;
  }
}

// Fixed: Assign to variable before exporting
const emailService = new EmailService();
export default emailService;
