# IronMap 🗺️

**The fitness tracker that knows your gym.**

IronMap is a self-hosted fitness tracking PWA with a community-powered gym equipment database. Know exactly what machines your gym has, their condition, and whether they're broken — before you walk in.

![IronMap Dashboard](https://getironmap.com/icons/icon_512.png)

## What makes IronMap different

Every other fitness app tracks what you did. IronMap also tells you what you're walking into.

- **Community gym equipment database** — Members confirm machines, report out-of-service equipment, and flag issues. The data stays accurate because real people who go to real gyms maintain it.
- **Gym-aware workout logging** — Select your gym and exercise suggestions come from what's actually on the floor. History is tied to the specific machine, not just the movement.
- **Last performance recap** — Type an exercise name and instantly see your last sets, reps, and weights for that specific machine at your gym. Right in the logging form.
- **Volume tracking** — See total pounds lifted per day. Hover any bar to see the full workout.
- **Personal records** — Auto-tracks your best lift by exercise and by specific machine with estimated 1RM.
- **Renpho scale sync** — Compatible with Renpho smart scales. Weight and body composition sync automatically.
- **Self-hosted & private** — Your workout data never leaves your server.

## Screenshots

> Dashboard with volume chart and hover tooltips

> Workout logging with gym-aware autocomplete and last performance recap

> Gym equipment database with condition tracking and OOS reporting

> Personal records by exercise and machine

## Tech stack

- **Frontend** — Vanilla JS PWA (installable on Android & iOS)
- **API** — Node.js with Express
- **Database** — PostgreSQL 16
- **Web server** — Nginx
- **Deployment** — Docker Compose
- **Auth** — JWT with bcrypt, invite-only registration

## Quick start

### Prerequisites
- Docker and Docker Compose
- A server (Unraid, VPS, Raspberry Pi, etc.)

### 1. Clone the repo

```bash
git clone https://github.com/bhman792/ironmap.git
cd ironmap
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
DB_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret_here
UNRAID_IP=192.168.1.100
```

### 3. Start the stack

```bash
docker compose up -d --build
```

### 4. Set up your admin account

```bash
curl -X POST http://localhost:8085/api/auth/setup \
  -H "Content-Type: application/json" \
  --data-raw '{"email":"you@example.com","password":"yourpassword","display_name":"Your Name"}'
```

### 5. Access the app

Open `http://your-server-ip:8085` in your browser and log in.

To install as a PWA on your phone, visit the URL in Chrome (Android) or Safari (iOS) and use "Add to Home Screen".

## Exposing to the internet (optional)

IronMap works great with [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for secure remote access without opening ports on your router.

```bash
cloudflared tunnel create ironmap
cloudflared tunnel route dns ironmap yourdomain.com
cloudflared tunnel run ironmap
```

## Renpho sync setup

IronMap supports automatic daily sync from Renpho smart scales. Add your Renpho credentials to `.env`:

```env
RENPHO_EMAIL=your_renpho_email
RENPHO_PASSWORD=your_renpho_password
```

The sync runs automatically at 9am daily. You can also trigger it manually from the Body Metrics tab.

## Invite system

IronMap uses invite-only registration. Generate invite codes from the Settings tab (admin only) or via API:

```bash
curl -X POST http://localhost:8085/api/auth/invite \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  --data-raw '{"note":"for friend","expires_days":7}'
```

## Contributing

Contributions are welcome! The gym equipment database especially benefits from community contributions — if you add your gym and confirm the equipment you're making IronMap more useful for everyone.

### Development setup

```bash
git clone https://github.com/bhman792/ironmap.git
cd ironmap
docker compose up -d --build
```

API runs on port 3000, Nginx on 8085.

### Areas that need help

- [ ] Progress photos tab
- [ ] Email notifications / password reset
- [ ] Apple Health / Samsung Health import
- [ ] Map view for gym discovery
- [ ] Social layer — community workout data

## Roadmap

- **Phase 1** ✅ Core workout, cardio, nutrition, and body metrics logging
- **Phase 2** ✅ Global equipment library with gym profiles
- **Phase 3** ✅ Gym-aware workout logging with per-machine history
- **Phase 4** 🚧 Community social layer
- **Phase 5** 📋 Gym discovery map

## License

MIT — free to use, modify, and self-host.

## Live demo

Try it at [getironmap.com](https://getironmap.com) — sign up for the founding member waitlist for free lifetime access.

---

Built for people who take their training seriously. 🏋️
