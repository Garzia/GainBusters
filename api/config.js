export default function handler(req, res) {
  res.status(200).json({ storageMode: 'browser', vercel: true });
}