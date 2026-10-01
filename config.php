<?php
/**
 * PulseTrade Pro - Production Configuration & Defensive Kernel
 * Self-healing PDO Connection, Cloudflare IP Resolution, and Citadel Defense
 */

declare(strict_types=1);

// Prevent direct execution if required or ensure safe session start
if (session_status() === PHP_SESSION_NONE) {
    // Harden session cookies
    ini_set('session.cookie_httponly', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.cookie_samesite', 'Lax');
    session_start();
}

// Global Exception & Error Trapping (Zero Uncaught Exceptions)
set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    // Log error cleanly without crashing script execution
    error_log("[PulseTrade Kernel Notice] $message in $file:$line");
    return true;
});

// Database Environment Configuration
// If DB_DRIVER is explicitly configured, use it. Otherwise, default to 'sqlite' unless DB_HOST is explicitly provided.
$dbDriver = getenv('DB_DRIVER');
if (!$dbDriver) {
    $dbDriver = (getenv('DB_HOST') || getenv('MYSQL_HOST')) ? 'mysql' : 'sqlite';
}
$dbHost   = getenv('DB_HOST') ?: (getenv('MYSQL_HOST') ?: '127.0.0.1');
$dbPort   = getenv('DB_PORT') ?: '3306';
$dbName   = getenv('DB_NAME') ?: 'pulsetrade_pro';
$dbUser   = getenv('DB_USER') ?: 'root';
$dbPass   = getenv('DB_PASS') ?: '';
$sqliteFile = __DIR__ . '/pulsetrade.sqlite';

/**
 * Resilient Database Factory (Self-Healing PDO)
 * Seamlessly connects to MySQL if configured, or uses the fast embedded SQLite engine.
 */
function getDatabaseConnection(): PDO {
    static $pdo = null;
    static $mysqlTestedAndFailed = false;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    global $dbDriver, $dbHost, $dbPort, $dbName, $dbUser, $dbPass, $sqliteFile;

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    // Attempt MySQL if explicitly selected and not previously failed
    if ($dbDriver === 'mysql' && extension_loaded('pdo_mysql') && !$mysqlTestedAndFailed) {
        try {
            $dsn = "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4";
            $pdo = new PDO($dsn, $dbUser, $dbPass, $options);
            return $pdo;
        } catch (PDOException $e) {
            $mysqlTestedAndFailed = true;
            if (getenv('APP_DEBUG')) {
                error_log("[PulseTrade DB] MySQL connection unavailable ({$e->getMessage()}). Using SQLite engine.");
            }
        }
    }

    // Embedded SQLite Engine (Fast, resilient, zero external dependencies)
    try {
        $dsn = "sqlite:" . $sqliteFile;
        $pdo = new PDO($dsn, null, null, $options);
        $pdo->exec("PRAGMA journal_mode = WAL;");
        $pdo->exec("PRAGMA foreign_keys = ON;");
        initializeDatabaseTablesIfMissing($pdo);
        return $pdo;
    } catch (PDOException $e) {
        // In-memory fallback if file system is read-only
        $pdo = new PDO("sqlite::memory:", null, null, $options);
        initializeDatabaseTablesIfMissing($pdo);
        return $pdo;
    }
}

/**
 * Auto-Migrates Schema for SQLite / Fresh Database
 */
function initializeDatabaseTablesIfMissing(PDO $pdo): void {
    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'USER',
                credits INTEGER NOT NULL DEFAULT 10,
                is_vip INTEGER NOT NULL DEFAULT 0,
                vip_expires_at TEXT NULL,
                registration_ip TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ip_registrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip_address TEXT NOT NULL UNIQUE,
                bonus_claimed INTEGER NOT NULL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS active_sessions (
                session_id TEXT PRIMARY KEY,
                user_id INTEGER NULL,
                ip_address TEXT NOT NULL,
                last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS system_settings (
                setting_key TEXT PRIMARY KEY,
                setting_value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS credit_pricing_tiers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                credits_amount INTEGER NOT NULL,
                bonus_credits INTEGER NOT NULL DEFAULT 0,
                price_usd REAL NOT NULL,
                badge_label TEXT DEFAULT '',
                is_active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS admin_crypto_wallets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                coin_name TEXT NOT NULL,
                symbol TEXT NOT NULL,
                network TEXT NOT NULL,
                wallet_address TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS crypto_invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                order_type TEXT NOT NULL,
                tier_id INTEGER NULL,
                price_usd REAL NOT NULL,
                pay_currency TEXT NOT NULL DEFAULT 'USDT',
                payment_id TEXT NULL,
                payment_status TEXT NOT NULL DEFAULT 'WAITING',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS signal_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                asset TEXT NOT NULL,
                timeframe TEXT NOT NULL,
                direction TEXT NOT NULL,
                confidence INTEGER NOT NULL,
                outcome TEXT NOT NULL,
                logged_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");

        // Seed default system settings
        $seeds = [
            'welcome_bonus_credits' => '10',
            'vip_monthly_price_usd' => '49.99',
            'nowpayments_api_key' => '',
            'nowpayments_ipn_secret' => '',
            'admin_pin' => '7789',
            'app_name' => 'PulseTrade Pro'
        ];
        $stmt = $pdo->prepare("INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES (?, ?)");
        foreach ($seeds as $k => $v) {
            $stmt->execute([$k, $v]);
        }

        // Seed default pricing tiers
        $tiers = [
            [1, 10, 0, 5.00, 'Starter Pack', 1],
            [2, 25, 5, 10.00, 'Popular (5 Free)', 1],
            [3, 60, 20, 20.00, 'Pro Trader (+20)', 1],
            [4, 150, 60, 45.00, 'Whale Alpha (+60)', 1]
        ];
        $tStmt = $pdo->prepare("INSERT OR IGNORE INTO credit_pricing_tiers (id, credits_amount, bonus_credits, price_usd, badge_label, is_active) VALUES (?, ?, ?, ?, ?, ?)");
        foreach ($tiers as $t) {
            $tStmt->execute($t);
        }

        // Seed default crypto wallets
        $wallets = [
            [1, 'Tether USD', 'USDT', 'TRC20', 'TJz7F8rK3vP1oXwY9mZqN2sAbCdEfGhIjK', 1],
            [2, 'Bitcoin', 'BTC', 'Native SegWit', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 1],
            [3, 'Solana', 'SOL', 'Solana Mainnet', '7Sbw7QkX2vG7L4k1vjGgHj8LpQpZ6PqP8kLmNoPqRsTu', 1]
        ];
        $wStmt = $pdo->prepare("INSERT OR IGNORE INTO admin_crypto_wallets (id, coin_name, symbol, network, wallet_address, is_active) VALUES (?, ?, ?, ?, ?, ?)");
        foreach ($wallets as $w) {
            $wStmt->execute($w);
        }

        // Default Admin (Email: durodoluwa5@gmail.com, Passcode: 7789)
        $adminStmt = $pdo->prepare("INSERT OR REPLACE INTO users (id, username, email, password_hash, role, credits, is_vip, registration_ip) VALUES (1, 'admin', 'durodoluwa5@gmail.com', ?, 'ADMIN', 9999, 1, '127.0.0.1')");
        $adminStmt->execute([password_hash('7789', PASSWORD_BCRYPT)]);

    } catch (PDOException $e) {
        error_log("[PulseTrade DB Init Exception] " . $e->getMessage());
    }
}

/**
 * Citadel IP Resolution - Evaluates True Client IP behind Cloudflare / Proxies
 */
function getClientIP(): string {
    $headers = [
        'HTTP_CF_CONNECTING_IP', // Cloudflare
        'HTTP_X_REAL_IP',        // Nginx / Ingress proxy
        'HTTP_X_FORWARDED_FOR',  // Standard proxy chain
        'REMOTE_ADDR'            // Direct socket
    ];

    foreach ($headers as $header) {
        if (!empty($_SERVER[$header])) {
            $ipList = explode(',', (string)$_SERVER[$header]);
            foreach ($ipList as $ip) {
                $ip = trim($ip);
                if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                    return $ip;
                }
            }
            // If private/local or valid IP
            $firstIp = trim($ipList[0]);
            if (filter_var($firstIp, FILTER_VALIDATE_IP)) {
                return $firstIp;
            }
        }
    }

    return '127.0.0.1';
}

/**
 * System Settings Helper with Memory Cache
 */
function getSetting(string $key, string $default = ''): string {
    static $settingsCache = null;
    try {
        $pdo = getDatabaseConnection();
        if ($settingsCache === null) {
            $stmt = $pdo->query("SELECT setting_key, setting_value FROM system_settings");
            $settingsCache = [];
            while ($row = $stmt->fetch()) {
                $settingsCache[$row['setting_key']] = $row['setting_value'];
            }
        }
        return $settingsCache[$key] ?? $default;
    } catch (PDOException $e) {
        return $default;
    }
}

/**
 * Update or Set a System Setting
 */
function updateSetting(string $key, string $value): bool {
    try {
        $pdo = getDatabaseConnection();
        $stmt = $pdo->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) 
            ON DUPLICATE KEY UPDATE setting_value = ?");
        // Also support SQLite style syntax via REPLACE if needed
        try {
            return $stmt->execute([$key, $value, $value]);
        } catch (Exception $ex) {
            $rep = $pdo->prepare("REPLACE INTO system_settings (setting_key, setting_value) VALUES (?, ?)");
            return $rep->execute([$key, $value]);
        }
    } catch (PDOException $e) {
        error_log("[PulseTrade Setting Update Error] " . $e->getMessage());
        return false;
    }
}

/**
 * Retrieves Current Authenticated User (or null if guest)
 */
function getCurrentUser(): ?array {
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    try {
        $pdo = getDatabaseConnection();
        $stmt = $pdo->prepare("SELECT id, username, email, role, credits, is_vip, vip_expires_at, registration_ip FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch();
        if (!$user) {
            unset($_SESSION['user_id']);
            return null;
        }

        // Check if VIP has expired (strictly enforce 30-day timeframe)
        $vipSecondsLeft = 0;
        $vipDaysLeft = 0;
        $vipHoursLeft = 0;
        if (!empty($user['is_vip'])) {
            if (!empty($user['vip_expires_at'])) {
                $expires = strtotime((string)$user['vip_expires_at']);
                if ($expires !== false) {
                    if ($expires <= time()) {
                        // 30-day timeframe has expired: revoke VIP immediately to prevent exceeding
                        $user['is_vip'] = 0;
                        $pdo->prepare("UPDATE users SET is_vip = 0 WHERE id = ?")->execute([$user['id']]);
                    } else {
                        $vipSecondsLeft = max(0, $expires - time());
                        $vipDaysLeft = (int)floor($vipSecondsLeft / 86400);
                        $vipHoursLeft = (int)floor(($vipSecondsLeft % 86400) / 3600);
                    }
                }
            } else {
                // If user is marked VIP but has no expiration timestamp, bind strictly to 30 days from now
                $defaultExpiry = date('Y-m-d H:i:s', time() + (30 * 86400));
                $pdo->prepare("UPDATE users SET vip_expires_at = ? WHERE id = ?")->execute([$defaultExpiry, $user['id']]);
                $user['vip_expires_at'] = $defaultExpiry;
                $vipSecondsLeft = 30 * 86400;
                $vipDaysLeft = 30;
                $vipHoursLeft = 0;
            }
        }
        $user['vip_seconds_left'] = $vipSecondsLeft;
        $user['vip_days_left'] = $vipDaysLeft;
        $user['vip_hours_left'] = $vipHoursLeft;

        return $user;
    } catch (PDOException $e) {
        error_log("[PulseTrade getCurrentUser Error] " . $e->getMessage());
        return null;
    }
}

/**
 * Valid VIP Activation Codes (Each unlocks strictly 30 days / 1 month access)
 */
function isValidVipKey(string $key): bool {
    $cleanKey = strtoupper(trim($key));
    $validKeys = [
        'VIP-ALPHA-30D',
        'PULSE-VIP-2026',
        'QUANT-30D',
        'VIP-TRADER-1M'
    ];
    // Also check dynamic admin-set VIP key if configured
    $adminVipKey = strtoupper(trim(getSetting('custom_vip_key', '')));
    if ($adminVipKey !== '') {
        $validKeys[] = $adminVipKey;
    }
    return in_array($cleanKey, $validKeys, true);
}

/**
 * Anti-Abuse Citadel Registration Engine
 * Detects previous IP registrations.
 * First-time IPs receive welcome bonus (default 10 credits).
 * Optional verified VIP key unlocks strictly 30-day VIP access.
 */
function registerUserDefensive(string $username, string $email, string $password, string $vipKey = ''): array {
    $username = trim($username);
    $email = trim(strtolower($email));
    $ip = getClientIP();

    if (strlen($username) < 3 || strlen($username) > 30) {
        return ['success' => false, 'message' => 'Username must be between 3 and 30 characters.'];
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return ['success' => false, 'message' => 'Invalid email address provided.'];
    }
    if (strlen($password) < 6) {
        return ['success' => false, 'message' => 'Password must be at least 6 characters long.'];
    }

    try {
        $pdo = getDatabaseConnection();

        // Check for duplicate username / email
        $check = $pdo->prepare("SELECT id, username, email FROM users WHERE username = ? OR email = ? LIMIT 1");
        $check->execute([$username, $email]);
        if ($row = $check->fetch()) {
            if (strtolower($row['username']) === strtolower($username)) {
                return ['success' => false, 'message' => 'Username already in use.'];
            }
            return ['success' => false, 'message' => 'Email already registered.'];
        }

        // Citadel Anti-Abuse IP Check
        $ipCheck = $pdo->prepare("SELECT id, bonus_claimed FROM ip_registrations WHERE ip_address = ? LIMIT 1");
        $ipCheck->execute([$ip]);
        $existingIP = $ipCheck->fetch();

        $welcomeBonus = (int)getSetting('welcome_bonus_credits', '10');
        $grantedCredits = $welcomeBonus;
        $bonusHarvestDetected = false;

        if ($existingIP) {
            // Anti-abuse triggered: Same IP already harvested a bonus account
            $grantedCredits = 0;
            $bonusHarvestDetected = true;
        } else {
            // Log new clean IP
            $logIP = $pdo->prepare("INSERT INTO ip_registrations (ip_address, bonus_claimed) VALUES (?, 1)");
            $logIP->execute([$ip]);
        }

        $isVip = 0;
        $vipExpiresAt = null;
        $vipGrantedMsg = "";

        if (!empty($vipKey)) {
            if (isValidVipKey($vipKey)) {
                $isVip = 1;
                // Strictly 30 days from moment of registration
                $vipExpiresAt = date('Y-m-d H:i:s', time() + (30 * 86400));
                $vipGrantedMsg = " ★ 30-Day VIP Pass activated! Valid until " . date('M d, Y', strtotime($vipExpiresAt)) . ".";
            } else {
                $vipGrantedMsg = " (Notice: Invalid VIP code provided. Standard free access granted).";
            }
        }

        $passwordHash = password_hash($password, PASSWORD_BCRYPT);
        $insert = $pdo->prepare("INSERT INTO users (username, email, password_hash, role, credits, is_vip, vip_expires_at, registration_ip) VALUES (?, ?, ?, 'USER', ?, ?, ?, ?)");
        $insert->execute([$username, $email, $passwordHash, $grantedCredits, $isVip, $vipExpiresAt, $ip]);

        $newUserId = (int)$pdo->lastInsertId();
        $_SESSION['user_id'] = $newUserId;

        return [
            'success' => true,
            'user_id' => $newUserId,
            'credits' => $grantedCredits,
            'is_vip' => $isVip,
            'vip_expires_at' => $vipExpiresAt,
            'vip_days_left' => $isVip ? 30 : 0,
            'anti_abuse_triggered' => $bonusHarvestDetected,
            'message' => $bonusHarvestDetected
                ? 'Account created! Welcome bonus bypassed (IP already registered previously).' . $vipGrantedMsg
                : "Account created successfully with {$grantedCredits} free starter credits!" . $vipGrantedMsg
        ];
    } catch (PDOException $e) {
        error_log("[PulseTrade Registration Exception] " . $e->getMessage());
        return ['success' => false, 'message' => 'System error during registration. Please try again.'];
    }
}
