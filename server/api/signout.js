export async function signoutHandler(req, res) {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    console.log(`[SIGNOUT] Session destroyed`);
    res.clearCookie('sessionid');
    return res.status(200).json({ message: 'Signed out successfully' });
  });
}
