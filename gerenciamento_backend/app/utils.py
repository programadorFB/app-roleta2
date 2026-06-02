from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta, date
from typing import Dict, List, Optional, Tuple
import hashlib
import secrets
import re

# === FINANCIAL CALCULATIONS ===

def calculate_profit_loss(initial_balance: Decimal, current_balance: Decimal, withdrawals: Decimal = Decimal('0')) -> Decimal:
    """Calculate real profit/loss considering withdrawals"""
    return current_balance - initial_balance - withdrawals

def calculate_roi(initial_investment: Decimal, current_value: Decimal, withdrawals: Decimal = Decimal('0')) -> Decimal:
    """Calculate Return on Investment (ROI) percentage"""
    if initial_investment <= 0:
        return Decimal('0')
    
    profit = calculate_profit_loss(initial_investment, current_value, withdrawals)
    roi = (profit / initial_investment) * 100
    return roi.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def calculate_win_rate(winning_sessions: int, total_sessions: int) -> Decimal:
    """Calculate win rate percentage"""
    if total_sessions <= 0:
        return Decimal('0')
    
    win_rate = (Decimal(winning_sessions) / Decimal(total_sessions)) * 100
    return win_rate.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def calculate_drawdown(peak_balance: Decimal, current_balance: Decimal) -> Dict[str, Decimal]:
    """Calculate drawdown amount and percentage"""
    if peak_balance <= 0:
        return {'amount': Decimal('0'), 'percentage': Decimal('0')}
    
    drawdown_amount = peak_balance - current_balance
    drawdown_percentage = (drawdown_amount / peak_balance) * 100
    
    return {
        'amount': drawdown_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
        'percentage': drawdown_percentage.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    }

def calculate_sharpe_ratio(returns: List[Decimal], risk_free_rate: Decimal = Decimal('0.02')) -> Decimal:
    """Calculate Sharpe ratio for risk-adjusted returns"""
    if not returns or len(returns) < 2:
        return Decimal('0')
    
    # Calculate average return and standard deviation
    avg_return = sum(returns) / len(returns)
    variance = sum((r - avg_return) ** 2 for r in returns) / (len(returns) - 1)
    std_dev = variance.sqrt() if variance > 0 else Decimal('0')
    
    if std_dev == 0:
        return Decimal('0')
    
    excess_return = avg_return - risk_free_rate
    sharpe = excess_return / std_dev
    
    return sharpe.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

# === RISK MANAGEMENT ===

def assess_risk_level(current_balance: Decimal, initial_balance: Decimal, stop_loss: Decimal) -> Dict[str, any]:
    """Assess current risk level based on balance and stop loss"""
    if stop_loss <= 0:
        return {
            'level': 'undefined',
            'status': 'No stop loss defined',
            'distance_percentage': None,
            'color': '#2f00ffff'
        }
    
    distance_from_stop_loss = current_balance - stop_loss
    distance_percentage = (distance_from_stop_loss / initial_balance) * 100
    
    if current_balance <= stop_loss:
        return {
            'level': 'critical',
            'status': 'STOP LOSS HIT',
            'distance_percentage': 0,
            'color': '#F44336'
        }
    elif distance_percentage < 5:
        return {
            'level': 'high',
            'status': 'HIGH RISK',
            'distance_percentage': float(distance_percentage),
            'color': '#FF9800'
        }
    elif distance_percentage < 15:
        return {
            'level': 'medium',
            'status': 'MEDIUM RISK',
            'distance_percentage': float(distance_percentage),
            'color': '#2f00ffff'
        }
    else:
        return {
            'level': 'low',
            'status': 'SAFE',
            'distance_percentage': float(distance_percentage),
            'color': '#4CAF50'
        }

def calculate_position_size(balance: Decimal, risk_percentage: Decimal, stop_loss_percentage: Decimal) -> Decimal:
    """Calculate position size based on risk management rules"""
    if stop_loss_percentage <= 0:
        return Decimal('0')
    
    risk_amount = balance * (risk_percentage / 100)
    position_size = risk_amount / (stop_loss_percentage / 100)
    
    return position_size.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

# === BETTING PROFILE UTILITIES ===

def get_profile_recommendations(risk_level: int) -> Dict[str, any]:
    """Get betting profile recommendations based on risk level"""
    if risk_level <= 3:
        return {
            'profile_type': 'cautious',
            'title': 'Jogador Cauteloso',
            'description': 'Apostas seguras com menor risco, focando em preservar a banca',
            'color': '#4CAF50',
            'icon': 'shield-alt',
            'features': [
    
                'Menor volatilidade',
                'Gestão rigorosa da banca',
                'Sessões mais longas'
            ],
            'recommended_stop_loss_percentage': 10,
            'recommended_profit_target_percentage': 20,
            'max_bet_percentage': 2
        }
    elif risk_level <= 8:
        return {
            'profile_type': 'balanced',
            'title': 'Jogador Equilibrado',
            'description': 'Equilíbrio entre risco e recompensa com estratégias diversificadas',
            'color': '#2f00ffff',
            'icon': 'balance-scale',
            'features': [
                
                'Risco calculado',
                'Estratégias diversificadas',
                'Flexibilidade nas apostas'
            ],
            'recommended_stop_loss_percentage': 20,
            'recommended_profit_target_percentage': 50,
            'max_bet_percentage': 5
        }
    else:
        return {
            'profile_type': 'aggressive',
            'title': 'Jogador de Alto Risco',
            'description': 'Busca grandes ganhos através de apostas de alto risco',
            'color': '#F44336',
            'icon': 'fire',
            'features': [
                'Apostas em números específicos',
                'Alta volatilidade',
                'Potencial de grandes ganhos',
                'Sessões intensas'
            ],
            'recommended_stop_loss_percentage': 30,
            'recommended_profit_target_percentage': 100,
            'max_bet_percentage': 10
        }

# === DATE AND TIME UTILITIES ===

def get_period_start_date(period: str) -> datetime:
    """Get start date for different periods"""
    now = datetime.utcnow()
    
    if period == 'today':
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == 'week':
        days_since_monday = now.weekday()
        return (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == 'month':
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == 'quarter':
        quarter_start_month = ((now.month - 1) // 3) * 3 + 1
        return now.replace(month=quarter_start_month, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == 'year':
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        return now - timedelta(days=30)  # Default to 30 days

def format_duration(seconds: int) -> str:
    """Format duration in seconds to human readable format"""
    if seconds < 60:
        return f"{seconds}s"
    elif seconds < 3600:
        minutes = seconds // 60
        return f"{minutes}m"
    else:
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        return f"{hours}h {minutes}m"

def get_date_range_label(start_date: datetime, end_date: datetime) -> str:
    """Get human readable label for date range"""
    if start_date.date() == end_date.date():
        return start_date.strftime("%d/%m/%Y")
    elif start_date.year == end_date.year:
        return f"{start_date.strftime('%d/%m')} - {end_date.strftime('%d/%m/%Y')}"
    else:
        return f"{start_date.strftime('%d/%m/%Y')} - {end_date.strftime('%d/%m/%Y')}"

# === VALIDATION UTILITIES ===

def validate_email(email: str) -> bool:
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_password_strength(password: str) -> Dict[str, any]:
    """Validate password strength"""
    result = {
        'is_valid': False,
        'score': 0,
        'issues': []
    }
    
    if len(password) < 8:
        result['issues'].append('Password must be at least 8 characters long')
    else:
        result['score'] += 1
    
    if not re.search(r'[A-Z]', password):
        result['issues'].append('Password must contain at least one uppercase letter')
    else:
        result['score'] += 1
    
    if not re.search(r'[a-z]', password):
        result['issues'].append('Password must contain at least one lowercase letter')
    else:
        result['score'] += 1
    
    if not re.search(r'\d', password):
        result['issues'].append('Password must contain at least one number')
    else:
        result['score'] += 1
    
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        result['issues'].append('Password must contain at least one special character')
    else:
        result['score'] += 1
    
    result['is_valid'] = result['score'] >= 3 and len(password) >= 8
    
    return result

def validate_transaction_amount(amount: Decimal, balance: Decimal, transaction_type: str) -> Dict[str, any]:
    """Validate transaction amount"""
    result = {
        'is_valid': True,
        'errors': []
    }
    
    if amount <= 0:
        result['is_valid'] = False
        result['errors'].append('Amount must be greater than zero')
    
    if transaction_type == 'withdraw' and amount > balance:
        result['is_valid'] = False
        result['errors'].append('Insufficient balance for withdrawal')
    
    # Check for reasonable amounts (prevent typos)
    if amount > Decimal('1000000'):  # 1 million
        result['is_valid'] = False
        result['errors'].append('Amount seems unusually large')
    
    return result

# === SECURITY UTILITIES ===

def generate_session_id() -> str:
    """Generate secure session ID"""
    return secrets.token_urlsafe(32)

def hash_password(password: str, salt: str = None) -> Tuple[str, str]:
    """Hash password with salt"""
    if salt is None:
        salt = secrets.token_hex(32)
    
    password_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return password_hash.hex(), salt

def verify_password(password: str, password_hash: str, salt: str) -> bool:
    """Verify password against hash"""
    computed_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(computed_hash, password_hash)

# === DATA FORMATTING UTILITIES ===

def format_currency(amount: Decimal, currency: str = 'BRL') -> str:
    """Format amount as currency"""
    if currency == 'BRL':
        return f"R$ {amount:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    else:
        return f"${amount:,.2f}"

def format_percentage(percentage: Decimal, decimal_places: int = 2) -> str:
    """Format percentage with specified decimal places"""
    return f"{percentage:.{decimal_places}f}%"

def parse_currency_input(input_str: str) -> Decimal:
    """Parse currency input string to Decimal"""
    # Remove currency symbols and spaces
    cleaned = re.sub(r'[R$\s]', '', input_str)
    # Replace comma with dot for decimal separator
    cleaned = cleaned.replace(',', '.')
    
    try:
        return Decimal(cleaned).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except:
        return Decimal('0')

# === ANALYTICS UTILITIES ===

def calculate_moving_average(values: List[Decimal], window: int) -> List[Decimal]:
    """Calculate moving average for a list of values"""
    if len(values) < window:
        return values
    
    moving_averages = []
    for i in range(len(values) - window + 1):
        avg = sum(values[i:i+window]) / window
        moving_averages.append(avg.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
    
    return moving_averages

def calculate_volatility(returns: List[Decimal]) -> Decimal:
    """Calculate volatility (standard deviation) of returns"""
    if len(returns) < 2:
        return Decimal('0')
    
    mean_return = sum(returns) / len(returns)
    variance = sum((r - mean_return) ** 2 for r in returns) / (len(returns) - 1)
    volatility = variance.sqrt() if variance > 0 else Decimal('0')
    
    return volatility.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def generate_performance_insights(stats: Dict) -> List[str]:
    """Generate performance insights based on statistics"""
    insights = []
    
    win_rate = Decimal(str(stats.get('win_rate', 0)))
    total_sessions = stats.get('total_sessions', 0)
    
    if total_sessions == 0:
        insights.append("Não há sessões suficientes para análise")
        return insights
    
    if win_rate > 60:
        insights.append("Excelente taxa de vitórias! Continue com a estratégia atual.")
    elif win_rate > 45:
        insights.append("Taxa de vitórias razoável, considere ajustar a estratégia.")
    else:
        insights.append("Taxa de vitórias baixa, revise sua estratégia de apostas.")
    
    avg_result = Decimal(str(stats.get('avg_session_result', 0)))
    if avg_result > 0:
        insights.append("Resultado médio positivo por sessão - bom desempenho!")
    elif avg_result < 0:
        insights.append("Resultado médio negativo - considere reduzir o risco.")
    
    if total_sessions > 50:
        insights.append("Histórico robusto de sessões para análise confiável.")
    elif total_sessions > 20:
        insights.append("Bom histórico de sessões, continue coletando dados.")
    else:
        insights.append("Histórico limitado - jogue mais para análises precisas.")
    
    return insights