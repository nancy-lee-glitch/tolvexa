<?php
/**
 * PulseTrade Pro - Unified Real-Time API Endpoint
 * Handles Signal Lockouts, Credit Deductions, Outcome Feedback, and Session State
 */

declare(strict_types=1);
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$pdo = getDatabaseConnection();
$user = getCurrentUser();

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}

$action = $input['action'] ?? ($_GET['action'] ?? '');

try {
    switch ($action) {
        case 'heartbeat':
            require __DIR__ . '/heartbeat.php';
            exit;

        case 'deduct_credit':
            if (!$user) {
                // Auto-create guest account with welcome bonus for seamless onboarding
                $ip = getClientIP();
                $guestUser = 'trader_' . substr(md5(session_id() . microtime()), 0, 6);
                $res = registerUserDefensive($guestUser, $guestUser . '@pulsetrade.local', 'pulse123');
                $user = getCurrentUser();
            }

            $userId = (int)$user['id'];
            $isVip = (int)$user['is_vip'] === 1;

            if ($isVip) {
                echo json_encode([
                    'success' => true,
                    'is_vip' => true,
                    'credits' => $user['credits'],
                    'message' => 'VIP Unlimited Access Active (0 credits consumed)'
                ]);
                exit;
            }

            if ((int)$user['credits'] <= 0) {
                echo json_encode([
                    'success' => false,
                    'is_vip' => false,
                    'credits' => 0,
                    'message' => 'Insufficient credits. Upgrade to VIP or top up credits.'
                ]);
                exit;
            }

            // Deduct 1 credit
            $stmt = $pdo->prepare("UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0");
            $stmt->execute([$userId]);

            $updatedUser = getCurrentUser();
            echo json_encode([
                'success' => true,
                'is_vip' => false,
                'credits' => $updatedUser ? (int)$updatedUser['credits'] : 0,
                'message' => '1 credit deducted for algorithmic signal computation.'
            ]);
            exit;

        case 'log_outcome':
            $userId = $user ? (int)$user['id'] : 1;
            $asset = trim((string)($input['asset'] ?? 'EUR/USD'));
            $timeframe = trim((string)($input['timeframe'] ?? '1m'));
            $direction = strtoupper(trim((string)($input['direction'] ?? 'CALL')));
            if (!in_array($direction, ['CALL', 'PUT'], true)) {
                $direction = 'CALL';
            }
            $confidence = max(50, min(99, (int)($input['confidence'] ?? 88)));
            $outcome = strtoupper(trim((string)($input['outcome'] ?? 'WIN')));
            if (!in_array($outcome, ['WIN', 'LOSS'], true)) {
                $outcome = 'WIN';
            }

            $stmt = $pdo->prepare("
                INSERT INTO signal_feedback (user_id, asset, timeframe, direction, confidence, outcome)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$userId, $asset, $timeframe, $direction, $confidence, $outcome]);

            // Calculate updated session win rate for dynamic recalibration
            $statStmt = $pdo->prepare("
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) as wins
                FROM signal_feedback 
                WHERE user_id = ?
            ");
            $statStmt->execute([$userId]);
            $stats = $statStmt->fetch();

            $total = (int)($stats['total'] ?? 0);
            $wins = (int)($stats['wins'] ?? 0);
            $winRate = $total > 0 ? round(($wins / $total) * 100, 1) : 85.0;

            echo json_encode([
                'success' => true,
                'session_total' => $total,
                'session_wins' => $wins,
                'session_win_rate' => $winRate,
                'recalibrated_threshold' => $winRate >= 80 ? 88 : 91
            ]);
            exit;

        case 'login':
            $identity = trim((string)($input['identity'] ?? ''));
            $password = (string)($input['password'] ?? '');

            $stmt = $pdo->prepare("SELECT id, username, email, password_hash FROM users WHERE username = ? OR email = ? LIMIT 1");
            $stmt->execute([$identity, $identity]);
            $found = $stmt->fetch();

            if ($found && password_verify($password, $found['password_hash'])) {
                $_SESSION['user_id'] = (int)$found['id'];
                $u = getCurrentUser();
                echo json_encode([
                    'success' => true,
                    'user' => [
                        'id' => $u['id'],
                        'username' => $u['username'],
                        'email' => $u['email'],
                        'role' => $u['role'],
                        'credits' => (int)$u['credits'],
                        'is_vip' => (int)$u['is_vip'],
                        'vip_expires_at' => $u['vip_expires_at'] ?? null,
                        'vip_days_left' => $u['vip_days_left'] ?? 0,
                        'vip_hours_left' => $u['vip_hours_left'] ?? 0,
                        'vip_seconds_left' => $u['vip_seconds_left'] ?? 0,
                    ],
                    'message' => 'Login successful.'
                ]);
            } else {
                echo json_encode(['success' => false, 'message' => 'Invalid username/email or password.']);
            }
            exit;

        case 'register':
            $username = trim((string)($input['username'] ?? ''));
            $email = trim((string)($input['email'] ?? ''));
            $password = (string)($input['password'] ?? '');
            $vipKey = trim((string)($input['vip_key'] ?? ($input['vipKey'] ?? '')));

            $res = registerUserDefensive($username, $email, $password, $vipKey);
            if ($res['success']) {
                $u = getCurrentUser();
                $res['user'] = [
                    'id' => $u['id'],
                    'username' => $u['username'],
                    'email' => $u['email'],
                    'role' => $u['role'],
                    'credits' => (int)$u['credits'],
                    'is_vip' => (int)$u['is_vip'],
                    'vip_expires_at' => $u['vip_expires_at'] ?? null,
                    'vip_days_left' => $u['vip_days_left'] ?? 0,
                    'vip_hours_left' => $u['vip_hours_left'] ?? 0,
                    'vip_seconds_left' => $u['vip_seconds_left'] ?? 0,
                ];
            }
            echo json_encode($res);
            exit;

        case 'redeem_vip':
            if (!$user) {
                echo json_encode(['success' => false, 'message' => 'Please sign in or create an account first.']);
                exit;
            }
            $key = trim((string)($input['vip_key'] ?? ($input['vipKey'] ?? '')));
            if (!isValidVipKey($key)) {
                echo json_encode(['success' => false, 'message' => 'Invalid or expired VIP key. Please check your activation code.']);
                exit;
            }

            // Strictly 30 days (1 month) timeframe
            $expiry = date('Y-m-d H:i:s', time() + (30 * 86400));
            $pdo->prepare("UPDATE users SET is_vip = 1, vip_expires_at = ? WHERE id = ?")->execute([$expiry, $user['id']]);

            $updated = getCurrentUser();
            echo json_encode([
                'success' => true,
                'message' => 'VIP status unlocked for strictly 30 days (expires ' . date('M d, Y', strtotime($expiry)) . ')!',
                'user' => [
                    'id' => $updated['id'],
                    'username' => $updated['username'],
                    'email' => $updated['email'],
                    'role' => $updated['role'],
                    'credits' => (int)$updated['credits'],
                    'is_vip' => 1,
                    'vip_expires_at' => $expiry,
                    'vip_days_left' => 30,
                    'vip_hours_left' => 0,
                    'vip_seconds_left' => 30 * 86400
                ]
            ]);
            exit;

        case 'status':
        case 'me':
            $u = getCurrentUser();
            echo json_encode([
                'status' => 'ok',
                'authenticated' => $u !== null,
                'user' => $u ? [
                    'id' => $u['id'],
                    'username' => $u['username'],
                    'email' => $u['email'],
                    'role' => $u['role'],
                    'credits' => (int)$u['credits'],
                    'is_vip' => (int)$u['is_vip'],
                    'vip_expires_at' => $u['vip_expires_at'] ?? null,
                    'vip_days_left' => $u['vip_days_left'] ?? 0,
                    'vip_hours_left' => $u['vip_hours_left'] ?? 0,
                    'vip_seconds_left' => $u['vip_seconds_left'] ?? 0,
                ] : null
            ]);
            exit;

        case 'logout':
            unset($_SESSION['user_id']);
            echo json_encode(['success' => true, 'message' => 'Logged out successfully.']);
            exit;

        default:
            $u = getCurrentUser();
            echo json_encode([
                'status' => 'ok',
                'service' => 'PulseTrade Pro Citadel API',
                'version' => '1.0.0',
                'user' => $u ? [
                    'id' => $u['id'],
                    'username' => $u['username'],
                    'email' => $u['email'],
                    'credits' => (int)$u['credits'],
                    'is_vip' => (int)$u['is_vip'],
                    'vip_expires_at' => $u['vip_expires_at'] ?? null,
                    'vip_days_left' => $u['vip_days_left'] ?? 0,
                    'vip_hours_left' => $u['vip_hours_left'] ?? 0,
                    'role' => $u['role']
                ] : null
            ]);
            exit;
    }
} catch (Throwable $e) {
    error_log("[PulseTrade API Fatal] " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Autonomous failover state handled.',
        'error' => $e->getMessage()
    ]);
}
