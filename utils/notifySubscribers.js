// utils/notifySubscribers.js
const nodemailer = require('nodemailer');
const Subscriber = require('../models/Subscriber');

const notifySubscribers = async (product) => {
  try {
    const subscribers = await Subscriber.find();
    if (!subscribers.length) return console.log('No subscribers to notify.');

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASS,
      },
    });

    const emails = subscribers.map((sub) => sub.email);
    const productUrl = `${process.env.FRONTEND_URL}/product/${product._id}`;
    
    // Check if image path is a full URL or relative
    const imageUrl = product.image.startsWith('http') 
      ? product.image 
      : `${process.env.BASE_URL}${product.image}`;

    const mailOptions = {
      from: `"TechnoZ" <${process.env.SMTP_EMAIL}>`,
      to: emails, // Note: For many subscribers, consider using 'bcc' instead of 'to' for privacy
      subject: `🆕 New Arrival: ${product.name} is now available!`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; background:#f4f4f7; padding:30px;">
          <div style="max-width:650px; margin:0 auto; background:#ffffff; padding:30px; border-radius:10px; box-shadow:0 4px 15px rgba(0,0,0,0.08);">
            
            <div style="text-align:center; margin-bottom:20px;">
              <span style="background:#ebf8ff; color:#2b6cb0; padding:5px 15px; border-radius:20px; font-size:12px; font-weight:bold; text-transform:uppercase;">New Arrival</span>
              <h1 style="color:#2d3748; margin:10px 0 0 0;">Something Fresh Just Arrived!</h1>
            </div>

            <div style="text-align:center; margin-bottom:25px;">
              <img src="${imageUrl}" alt="${product.name}" style="width:100%; max-width:400px; border-radius:12px; object-fit:cover; border:1px solid #edf2f7;" />
            </div>

            <div style="padding:0 10px;">
              <h2 style="color:#2d3748; font-size:22px; margin-bottom:10px;">${product.name}</h2>
              <p style="color:#4a5568; font-size:15px; line-height:1.6;">${product.description}</p>
              
              <div style="background:#f9fafb; padding:15px; border-radius:8px; margin:20px 0;">
                <p style="margin:0; font-size:18px; color:#2d3748;">
                  <strong>Price:</strong> $${product.price}
                  ${product.discountPercentage ? `<span style="color:#e53e3e; font-size:14px; margin-left:10px;">(${product.discountPercentage}% OFF)</span>` : ''}
                </p>
              </div>

              <div style="text-align:center; margin-top:30px;">
                <a href="${productUrl}"
                  style="display:inline-block; background:#2b6cb0; color:white; padding:12px 25px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:16px;">
                  Shop Now & Save
                </a>
              </div>
            </div>

            <p style="font-size:14px; color:#718096; margin-top:40px; border-top:1px solid #edf2f7; padding-top:20px;">
              Happy Shopping,<br/>
              <strong>TechnoZ Team</strong>
            </p>
          </div>

          <div style="text-align:center; font-size:12px; color:#a0aec0; margin-top:15px;">
            <p>© ${new Date().getFullYear()} TechnoZ. All rights reserved.</p>
            <p>You are receiving this because you are subscribed to our newsletter.<br/>
            <a href="#" style="color:#a0aec0; text-decoration:underline;">Unsubscribe</a></p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Notification emails sent to ${emails.length} subscribers`);
  } catch (error) {
    console.error('❌ Error sending notification emails:', error.message);
  }
};

module.exports = notifySubscribers;