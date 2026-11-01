const bcrypt = require('bcryptjs');

const usersStore = [];

function getDefaultSeedUsers() {
  return [
    {
      id: 'USR-GATE-001',
      fullName: 'Gate Staff Lead',
      email: 'gate.staff@passpulse.io',
      passwordHash: bcrypt.hashSync('GateStaff@2026', 10),
      role: 'GATE_STAFF',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'USR-STAFF-001',
      fullName: 'Event Operations Staff',
      email: 'staff@passpulse.io',
      passwordHash: bcrypt.hashSync('Staff@2026', 10),
      role: 'STAFF',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'USR-ADMIN-001',
      fullName: 'System Administrator',
      email: 'admin@passpulse.io',
      passwordHash: bcrypt.hashSync('Admin@2026', 10),
      role: 'ADMIN',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'USR-ATTENDEE-001',
      fullName: 'Alex Johnson',
      email: 'alex.johnson@example.com',
      passwordHash: bcrypt.hashSync('Attendee@2026', 10),
      role: 'ATTENDEE',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'USR-DEMO-001',
      fullName: 'Demo Attendee',
      email: 'demo@passpulse.io',
      passwordHash: bcrypt.hashSync('Attendee@2026', 10),
      role: 'ATTENDEE',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'USR-ATTENDEE-002',
      fullName: 'Sarah Connor',
      email: 'sarah.connor@example.com',
      passwordHash: bcrypt.hashSync('Attendee@2026', 10),
      role: 'ATTENDEE',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'USR-ORG-001',
      fullName: 'Event Organizer',
      email: 'organizer@passpulse.io',
      passwordHash: bcrypt.hashSync('Organizer@2026', 10),
      role: 'ORGANIZER',
      createdAt: new Date().toISOString(),
    },
  ];
}

class UserModel {
  static async create({ id, fullName, email, passwordHash, role = 'ATTENDEE' }) {
    const newUser = {
      id: id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fullName,
      email: email.toLowerCase().trim(),
      passwordHash,
      role: role.toUpperCase(),
      createdAt: new Date().toISOString(),
    };
    usersStore.push(newUser);
    return { ...newUser };
  }

  static async findByEmail(email) {
    const normalized = email.toLowerCase().trim();
    const user = usersStore.find((u) => u.email === normalized);
    return user ? { ...user } : null;
  }

  static async findById(id) {
    const user = usersStore.find((u) => u.id === id);
    return user ? { ...user } : null;
  }

  static seedDefaultUsers() {
    if (usersStore.length === 0) {
      usersStore.push(...getDefaultSeedUsers());
    }
  }

  static async clearAll() {
    usersStore.length = 0;
  }

  static getAllUsers() {
    return [...usersStore];
  }
}

// Seed default demo accounts ONLY in development mode (SEC-001, CWE-1188)
// Never automatically seed in production or test mode
if (process.env.NODE_ENV === 'development') {
  UserModel.seedDefaultUsers();
}

module.exports = UserModel;
