const express = require('express');
const router = express.Router();
const Subscriber = require('../models/Subscriber');

// ✅ Unsubscribe route
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const subscriber = await Subscriber.findOne({ unsubscribeToken: token });

    if (!subscriber) {
      return res.send(`
        <div style="font-family: Arial; text-align:center; padding:50px;">
          <h2 style="color:red;">❌ Invalid or expired unsubscribe link.</h2>
        </div>
      `);
    }

    // Remove the subscriber so they won’t get future emails
    await Subscriber.deleteOne({ _id: subscriber._id });

    // Show confirmation message
    res.send(`
      <div style="font-family: Arial; text-align:center; padding:50px;">
        <h2 style="color:green;">✅ You have successfully unsubscribed!</h2>
        <p>You will no longer receive product updates or newsletters from <strong>TechnoZ</strong>.</p>
      </div>
    `);
  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.status(500).send(`
      <div style="font-family: Arial; text-align:center; padding:50px;">
        <h2 style="color:red;">⚠️ Something went wrong while unsubscribing.</h2>
        <p>Please try again later.</p>
      </div>
    `);
  }
});

module.exports = router;
