const usersStore = [];

class UserModel {
  static async create({ fullName, email, passwordHash, role = 'ATTENDEE' }) {
    const newUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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

  static async clearAll() {
    usersStore.length = 0;
  }
}

module.exports = UserModel;
