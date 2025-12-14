const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

async function sendMail({ to, subject, html }) {
    let transporter;
    if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
        // Use real SMTP provider
        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT),
            secure: Number(SMTP_PORT) === 465, // true for 465, false for other ports
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS
            }
        });
    } else {
        // Fallback to Ethereal for testing
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            }
        });
    }

    const info = await transporter.sendMail({
        from: `P2P Hub <${SMTP_USER || 'no-reply@p2phub.com'}>`,
        to,
        subject,
        html
    });

    if (!SMTP_HOST) {
        // Preview URL for Ethereal
        console.log('Message sent: %s', info.messageId);
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    }

    return info;
}

module.exports = { sendMail };
