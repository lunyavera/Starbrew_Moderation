const mysql = require('mysql2/promise');
const config = require('../config.json');

class PunishmentManager {
  constructor() {
    this.pool = null;
    this.dbName = config.mysql.database;
    this.punishmentCounter = 0;
  }

  async init() {
    const { host, user, password } = config.mysql || {};
    if (!host || !user) throw new Error('MySQL config missing in config.json');

    // Connect without a database to ensure the punishment database exists
    const connection = await mysql.createConnection({ host, user, password, multipleStatements: true });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${this.dbName}\``);
    await connection.query(`USE \`${this.dbName}\``);

    // Create punishments table with an internal auto-increment id and a formatted case_id (C-#####)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS punishments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        case_id VARCHAR(8) UNIQUE,
        user_id VARCHAR(32) NOT NULL,
        moderator_id VARCHAR(32) NOT NULL,
        type ENUM('ban','unban','timeout','untimeout') NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    const [rows] = await connection.query('SELECT COALESCE(MAX(id), 0) AS last_id FROM punishments');
    this.punishmentCounter = rows[0]?.last_id || 0;

    await connection.end();

    // Create a pool connected to the punishment database
    this.pool = mysql.createPool({ host, user, password, database: this.dbName, waitForConnections: true, connectionLimit: 10 });
  }

  getPunishmentCounter() {
    return this.punishmentCounter;
  }

  getNextCaseId() {
    const nextCounter = this.punishmentCounter + 1;
    this.punishmentCounter = nextCounter;
    return `C-${String(nextCounter).padStart(5, '0')}`;
  }

  async addPunishment({ userId, moderatorId, type, reason }) {
    if (!this.pool) throw new Error('PunishmentManager not initialized');
    if (!['ban', 'unban', 'timeout', 'untimeout'].includes(type)) throw new Error('Invalid punishment type');

    const caseId = this.getNextCaseId();

    const conn = await this.pool.getConnection();
    try {
      await conn.execute(
        'INSERT INTO punishments (case_id, user_id, moderator_id, type, reason) VALUES (?, ?, ?, ?, ?)',
        [caseId, String(userId), String(moderatorId), type, reason || null]
      );
      return caseId;
    } catch (err) {
      throw err;
    } finally {
      conn.release();
    }
  }

  async getPunishment(caseId) {
    if (!this.pool) throw new Error('PunishmentManager not initialized');
    const [rows] = await this.pool.execute('SELECT * FROM punishments WHERE case_id = ?', [caseId]);
    return rows[0] || null;
  }

  async getPunishmentsByUser(userId) {
    if (!this.pool) throw new Error('PunishmentManager not initialized');
    const [rows] = await this.pool.execute('SELECT * FROM punishments WHERE user_id = ? ORDER BY created_at DESC', [String(userId)]);
    return rows;
  }

  async removePunishment(caseId) {
    if (!this.pool) throw new Error('PunishmentManager not initialized');
    const [result] = await this.pool.execute('DELETE FROM punishments WHERE case_id = ?', [caseId]);
    return result.affectedRows > 0;
  }

  async close() {
    if (this.pool) await this.pool.end();
  }
}

module.exports = new PunishmentManager();
