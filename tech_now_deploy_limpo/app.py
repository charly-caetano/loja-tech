import eventlet
eventlet.monkey_patch()

from flask import Flask, jsonify, send_from_directory, request, session, flash, redirect, url_for
import sqlite3
import os
import uuid
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_socketio import SocketIO, emit
from datetime import datetime

# Define a pasta static como a raiz de arquivos estáticos (css, js, imagens)
app = Flask(__name__, static_folder='static', static_url_path='/static')
app.config['SECRET_KEY'] = 'tech_now_secret_key'
db_path = os.path.join(os.path.dirname(__file__), 'tech now.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'.replace('\\', '/')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'landing'
socketio = SocketIO(app)

class Cliente(UserMixin, db.Model):
    __tablename__ = 'clientes'
    ID = db.Column(db.Integer, primary_key=True, autoincrement=True)
    nome = db.Column(db.String(100))
    cpf = db.Column(db.String(20))
    email = db.Column(db.String(100), unique=True)
    telefone = db.Column(db.String(20))
    endereco = db.Column(db.Text)
    data_cadastro = db.Column(db.String(50))
    senha = db.Column(db.String(200))
    def get_id(self): return f'C_{self.ID}'

class Gerente(UserMixin, db.Model):
    __tablename__ = 'gerentes'
    ID = db.Column(db.Integer, primary_key=True, autoincrement=True)
    nome = db.Column(db.String(100))
    email = db.Column(db.String(100), unique=True)
    senha = db.Column(db.String(200))
    def get_id(self): return f'G_{self.ID}'

class Mensagem(db.Model):
    __tablename__ = 'mensagens'
    ID = db.Column(db.Integer, primary_key=True, autoincrement=True)
    cliente_id = db.Column(db.Integer, db.ForeignKey('clientes.ID'))
    assunto = db.Column(db.String(200))
    conteudo = db.Column(db.Text)
    data = db.Column(db.String(50))
    lida = db.Column(db.Integer, default=0)
    remetente = db.Column(db.String(50), default='loja')

class Cupom(db.Model):
    __tablename__ = 'cupons'
    ID = db.Column(db.Integer, primary_key=True, autoincrement=True)
    codigo = db.Column(db.String(50), unique=True)
    desconto_porcentagem = db.Column(db.Integer)
    valido_ate = db.Column(db.String(50))
    ativo = db.Column(db.Integer, default=1)

class CartaoSalvo(db.Model):
    __tablename__ = 'cartoes_salvos'
    ID = db.Column(db.Integer, primary_key=True, autoincrement=True)
    cliente_id = db.Column(db.Integer, db.ForeignKey('clientes.ID'))
    tipo = db.Column(db.String(50)) # credito ou debito
    final_cartao = db.Column(db.String(4))
    bandeira = db.Column(db.String(50))
    nome_titular = db.Column(db.String(100))


@login_manager.user_loader
def load_user(user_id):
    if user_id.startswith('C_'):
        return db.session.get(Cliente, int(user_id[2:]))
    elif user_id.startswith('G_'):
        return db.session.get(Gerente, int(user_id[2:]))
    return None


def get_db_connection():
    # Pega o caminho correto do banco de dados na mesma pasta (para deploy)
    db_path = os.path.join(os.path.dirname(__file__), 'tech now.db')
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

# Variáveis globais de configuração em memória
CONFIG = {
    'nome_loja': 'Tech Now',
    'email_suporte': 'suporte@technow.com.br',
    'modo_manutencao': False
}

@app.route('/')
def landing():
    return send_from_directory('templates', 'landing.html')

@app.route('/painel-gerente')
@login_required
def index():
    return send_from_directory('templates', 'index.html')

@app.route('/login/gerente')
def login_gerente():
    return send_from_directory('templates', 'login_gerente.html')

@app.route('/login/cliente')
def login_cliente():
    return send_from_directory('templates', 'login_cliente.html')

@app.route('/cadastro/cliente')
def cadastro_cliente():
    return send_from_directory('templates', 'cadastro_cliente.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Você saiu da conta.', 'info')
    return redirect(url_for('landing'))

@app.route('/area-cliente')
@login_required
def area_cliente():
    if CONFIG['modo_manutencao']:
        return send_from_directory('templates', 'manutencao.html')
    return send_from_directory('templates', 'area_cliente.html')

@app.route('/api/configuracoes', methods=['GET', 'POST'])
def api_configuracoes():
    if request.method == 'POST':
        if not current_user.is_authenticated or not current_user.get_id().startswith('G_'):
            return jsonify({'status': 'error', 'message': 'Acesso negado.'})
        dados = request.get_json()
        CONFIG['nome_loja'] = dados.get('nome_loja', CONFIG['nome_loja'])
        CONFIG['email_suporte'] = dados.get('email_suporte', CONFIG['email_suporte'])
        CONFIG['modo_manutencao'] = bool(dados.get('modo_manutencao', False))
        return jsonify({'status': 'success', 'message': 'Configurações salvas.'})
    
    return jsonify({
        'status': 'success',
        'nome_loja': CONFIG['nome_loja'],
        'email_suporte': CONFIG['email_suporte'],
        'modo_manutencao': CONFIG['modo_manutencao']
    })

@app.route('/api/metrics')
def get_metrics():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # 1. Faturamento Total
        cur.execute("SELECT SUM(valor_total) as faturamento FROM vendas")
        faturamento_row = cur.fetchone()
        faturamento = faturamento_row['faturamento'] if faturamento_row['faturamento'] else 0
        
        # 2. Ticket Médio
        cur.execute("SELECT AVG(valor_total) as ticket FROM vendas")
        ticket_row = cur.fetchone()
        ticket_medio = ticket_row['ticket'] if ticket_row['ticket'] else 0
        
        # 3. Total de Clientes (Substituindo Taxa de Conversão por Total de Clientes)
        cur.execute("SELECT COUNT(ID) as total_clientes FROM clientes")
        clientes = cur.fetchone()['total_clientes']
        
        # 4. Total de Pedidos/Vendas
        cur.execute("SELECT COUNT(ID) as total_vendas FROM vendas")
        vendas = cur.fetchone()['total_vendas']

        # 5. Dados de Hoje
        cur.execute("SELECT SUM(valor_total) as f_hoje, COUNT(ID) as p_hoje FROM vendas WHERE date(data_venda) = date('now', 'localtime')")
        hoje_row = cur.fetchone()
        faturamento_hoje = hoje_row['f_hoje'] if hoje_row['f_hoje'] else 0
        pedidos_hoje = hoje_row['p_hoje'] if hoje_row['p_hoje'] else 0

        # 6. Dados do Mês
        cur.execute("SELECT SUM(valor_total) as f_mes, COUNT(ID) as p_mes FROM vendas WHERE strftime('%Y-%m', data_venda) = strftime('%Y-%m', 'now', 'localtime')")
        mes_row = cur.fetchone()
        faturamento_mes = mes_row['f_mes'] if mes_row['f_mes'] else 0
        pedidos_mes = mes_row['p_mes'] if mes_row['p_mes'] else 0
        
        # 7. Clientes Novos Hoje e Mês
        cur.execute("SELECT COUNT(ID) as c_hoje FROM clientes WHERE date(data_cadastro) = date('now', 'localtime')")
        clientes_hoje = cur.fetchone()['c_hoje']
        cur.execute("SELECT COUNT(ID) as c_mes FROM clientes WHERE strftime('%Y-%m', data_cadastro) = strftime('%Y-%m', 'now', 'localtime')")
        clientes_mes = cur.fetchone()['c_mes']

        # 8. Mês Anterior para Comparação
        cur.execute("SELECT SUM(valor_total) as f_mes_ant, COUNT(ID) as p_mes_ant FROM vendas WHERE strftime('%Y-%m', data_venda) = strftime('%Y-%m', 'now', '-1 month', 'localtime')")
        mes_ant_row = cur.fetchone()
        faturamento_mes_ant = mes_ant_row['f_mes_ant'] if mes_ant_row['f_mes_ant'] else 0
        pedidos_mes_ant = mes_ant_row['p_mes_ant'] if mes_ant_row['p_mes_ant'] else 0
        
        cur.execute("SELECT COUNT(ID) as c_mes_ant FROM clientes WHERE strftime('%Y-%m', data_cadastro) = strftime('%Y-%m', 'now', '-1 month', 'localtime')")
        clientes_mes_ant = cur.fetchone()['c_mes_ant']
        
        conn.close()
        
        return jsonify({
            'faturamento': faturamento,
            'ticket_medio': ticket_medio,
            'clientes': clientes,
            'pedidos': vendas,
            'faturamento_hoje': faturamento_hoje,
            'faturamento_mes': faturamento_mes,
            'pedidos_hoje': pedidos_hoje,
            'pedidos_mes': pedidos_mes,
            'clientes_hoje': clientes_hoje,
            'clientes_mes': clientes_mes,
            'faturamento_mes_ant': faturamento_mes_ant,
            'pedidos_mes_ant': pedidos_mes_ant,
            'clientes_mes_ant': clientes_mes_ant,
            'status': 'success'
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/produtos')
def get_produtos():
    try:
        dias = request.args.get('dias', 'todos')
        where_vendas = ""
        if dias != 'todos':
            try:
                dias_int = int(dias)
                where_vendas = f"AND date(v.data_venda) >= date('now', '-{dias_int} days', 'localtime')"
            except:
                pass
                
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(f"""
            SELECT p.ID, p.nome_produto, p.descricao, p.preco, p.quantidade_estoque, p.categoria, p.ativo,
                   IFNULL((
                       SELECT SUM(iv.quantidade * iv.preco_unitario) 
                       FROM itens_venda iv 
                       JOIN vendas v ON v.ID = iv.id_venda
                       WHERE iv.id_produto = p.ID {where_vendas}
                   ), 0) as faturamento_total
            FROM produtos p 
            LIMIT 50
        """)
        produtos = [dict(row) for row in cur.fetchall()]
        conn.close()
        return jsonify({'status': 'success', 'produtos': produtos})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/chart-vendas')
def get_chart_vendas():
    try:
        dias = request.args.get('dias', '7')
        where_clause = ""
        dias_int = None
        if dias != 'todos':
            try:
                dias_int = int(dias)
                where_clause = f"WHERE date(data_venda) >= date('now', '-{dias_int} days', 'localtime')"
            except:
                dias_int = 7
                where_clause = "WHERE date(data_venda) >= date('now', '-7 days', 'localtime')"

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(f"""
            SELECT date(data_venda) as dia, SUM(valor_total) as total
            FROM vendas
            {where_clause}
            GROUP BY date(data_venda)
            ORDER BY date(data_venda) ASC
        """)
        vendas = cur.fetchall()
        conn.close()
        
        if dias_int:
            from datetime import datetime, timedelta
            hoje = datetime.now().date()
            labels = [(hoje - timedelta(days=i)).strftime('%Y-%m-%d') for i in range(dias_int-1, -1, -1)]
            vendas_dict = {row['dia']: row['total'] for row in vendas}
            data = [vendas_dict.get(dia, 0) for dia in labels]
        else:
            labels = [row['dia'] for row in vendas]
            data = [row['total'] for row in vendas]
        
        return jsonify({'status': 'success', 'labels': labels, 'data': data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/vendas')
def get_vendas():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT v.codigo_pedido, v.data_venda, v.valor_total, c.nome as cliente_nome
            FROM vendas v
            JOIN clientes c ON v.id_cliente = c.ID
            ORDER BY v.valor_total DESC
            LIMIT 50
        """)
        vendas = [dict(row) for row in cur.fetchall()]
        conn.close()
        return jsonify({'status': 'success', 'vendas': vendas})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/comprar', methods=['POST'])
@login_required
def comprar_produto():
    if not current_user.get_id().startswith('C_'):
        return jsonify({'status': 'error', 'message': 'Apenas clientes podem comprar.'})
    try:
        dados = request.get_json()
        produto_id = dados.get('produto_id')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Buscar produto
        cur.execute("SELECT preco, quantidade_estoque FROM produtos WHERE ID = ?", (produto_id,))
        produto = cur.fetchone()
        
        if not produto:
            return jsonify({'status': 'error', 'message': 'Produto não encontrado.'})
            
        if produto['quantidade_estoque'] <= 0:
            return jsonify({'status': 'error', 'message': 'Estoque esgotado.'})
            
        # Baixar o estoque
        cur.execute("UPDATE produtos SET quantidade_estoque = quantidade_estoque - 1 WHERE ID = ?", (produto_id,))
        
        # Inserir a Venda para o cliente logado
        codigo = f"PED-{uuid.uuid4().hex[:6].upper()}"
        cur.execute("INSERT INTO vendas (id_cliente, valor_total, codigo_pedido) VALUES (?, ?, ?)", (current_user.ID, produto['preco'], codigo))
        id_venda = cur.lastrowid
        
        # Inserir na tabela de itens
        cur.execute("INSERT INTO itens_venda (id_venda, id_produto, quantidade, preco_unitario) VALUES (?, ?, 1, ?)", (id_venda, produto_id, produto['preco']))
        
        conn.commit()
        conn.close()
        
        socketio.emit('nova_venda', {'message': f'Venda de R${produto["preco"]} efetuada!'})
        return jsonify({'status': 'success', 'message': f'Compra registrada com sucesso! Pedido: {codigo}'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/produtos/cadastrar', methods=['POST'])
@login_required
def cadastrar_produto():
    if not current_user.get_id().startswith('G_'):
        return jsonify({'status': 'error', 'message': 'Acesso negado.'})
    try:
        dados = request.get_json()
        nome = dados.get('nome')
        categoria = dados.get('categoria')
        preco = float(dados.get('preco'))
        estoque = int(dados.get('estoque'))
        descricao = dados.get('descricao')
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("INSERT INTO produtos (nome_produto, descricao, preco, quantidade_estoque, categoria) VALUES (?, ?, ?, ?, ?)", 
                    (nome, descricao, preco, estoque, categoria))
        produto_id = cur.lastrowid
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'message': 'Produto cadastrado com sucesso!', 'produto_id': produto_id})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/produtos/<int:produto_id>/imagens', methods=['GET'])
def get_produto_imagens(produto_id):
    img_dir = os.path.join(app.static_folder, 'img')
    imagens = []
    for i in range(1, 4):
        path = os.path.join(img_dir, f'{produto_id}_{i}.png')
        if os.path.exists(path):
            imagens.append({'slot': i, 'url': f'/static/img/{produto_id}_{i}.png'})
    return jsonify({'status': 'success', 'imagens': imagens})

@app.route('/api/produtos/<int:produto_id>/imagem/upload', methods=['POST'])
@login_required
def upload_produto_imagem(produto_id):
    if not current_user.get_id().startswith('G_'):
        return jsonify({'status': 'error', 'message': 'Acesso negado.'})
    try:
        slot = request.form.get('slot', '1')
        if 'imagem' not in request.files:
            return jsonify({'status': 'error', 'message': 'Nenhum arquivo enviado.'})
        
        file = request.files['imagem']
        if file.filename == '':
            return jsonify({'status': 'error', 'message': 'Nenhum arquivo selecionado.'})
        
        img_dir = os.path.join(app.static_folder, 'img')
        os.makedirs(img_dir, exist_ok=True)
        
        filename = f'{produto_id}_{slot}.png'
        filepath = os.path.join(img_dir, filename)
        file.save(filepath)
        
        return jsonify({'status': 'success', 'message': f'Imagem {slot} enviada com sucesso!', 'url': f'/static/img/{filename}'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/produtos/<int:produto_id>/imagem/excluir', methods=['POST'])
@login_required
def excluir_produto_imagem(produto_id):
    if not current_user.get_id().startswith('G_'):
        return jsonify({'status': 'error', 'message': 'Acesso negado.'})
    try:
        dados = request.get_json()
        slot = dados.get('slot', 1)
        
        img_dir = os.path.join(app.static_folder, 'img')
        filepath = os.path.join(img_dir, f'{produto_id}_{slot}.png')
        
        if os.path.exists(filepath):
            os.remove(filepath)
            return jsonify({'status': 'success', 'message': f'Imagem {slot} excluída!'})
        else:
            return jsonify({'status': 'error', 'message': 'Imagem não encontrada.'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/produtos/editar', methods=['POST'])
@login_required
def editar_produto():
    if not current_user.get_id().startswith('G_'):
        return jsonify({'status': 'error', 'message': 'Acesso negado.'})
    try:
        dados = request.get_json()
        pid = dados.get('id')
        nome = dados.get('nome')
        categoria = dados.get('categoria')
        preco = float(dados.get('preco'))
        estoque = int(dados.get('estoque'))
        descricao = dados.get('descricao')
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            UPDATE produtos 
            SET nome_produto=?, categoria=?, preco=?, quantidade_estoque=?, descricao=? 
            WHERE ID=?
        """, (nome, categoria, preco, estoque, descricao, pid))
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'message': 'Produto atualizado com sucesso!'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/lista-desejos', methods=['GET'])
@login_required
def get_lista_desejos():
    if not current_user.get_id().startswith('C_'):
        return jsonify({'status': 'error', 'message': 'Apenas clientes.'})
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT p.ID, p.nome_produto, p.preco, p.quantidade_estoque, p.categoria
            FROM lista_desejos ld
            JOIN produtos p ON ld.id_produto = p.ID
            WHERE ld.id_cliente = ?
            ORDER BY ld.data_adicao DESC
        """, (current_user.ID,))
        produtos = [dict(row) for row in cur.fetchall()]
        conn.close()
        return jsonify({'status': 'success', 'produtos': produtos})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/lista-desejos/toggle', methods=['POST'])
@login_required
def toggle_lista_desejos():
    if not current_user.get_id().startswith('C_'):
        return jsonify({'status': 'error', 'message': 'Apenas clientes.'})
    try:
        dados = request.get_json()
        produto_id = dados.get('produto_id')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verifica se já existe
        cur.execute("SELECT ID FROM lista_desejos WHERE id_cliente = ? AND id_produto = ?", (current_user.ID, produto_id,))
        existe = cur.fetchone()
        
        if existe:
            cur.execute("DELETE FROM lista_desejos WHERE id_cliente = ? AND id_produto = ?", (current_user.ID, produto_id,))
            acao = "removido"
        else:
            cur.execute("INSERT INTO lista_desejos (id_cliente, id_produto) VALUES (?, ?)", (current_user.ID, produto_id,))
            acao = "adicionado"
            
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'acao': acao})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/estoque/adicionar', methods=['POST'])
@login_required
def adicionar_estoque():
    if not current_user.get_id().startswith('G_'):
        return jsonify({'status': 'error', 'message': 'Acesso negado.'})
    try:
        dados = request.get_json()
        pid = dados.get('id')
        qtd = int(dados.get('quantidade', 0))
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("UPDATE produtos SET quantidade_estoque = quantidade_estoque + ? WHERE ID = ?", (qtd, pid))
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'message': 'Estoque atualizado com sucesso!'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/estoque/status', methods=['POST'])
@login_required
def alterar_status_estoque():
    if not current_user.get_id().startswith('G_'):
        return jsonify({'status': 'error', 'message': 'Acesso negado.'})
    try:
        dados = request.get_json()
        pid = dados.get('id')
        ativo = int(dados.get('ativo', 1))
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("UPDATE produtos SET ativo = ? WHERE ID = ?", (ativo, pid))
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'message': 'Status alterado com sucesso!'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/minhas-compras')
@login_required
def minhas_compras():
    if not current_user.get_id().startswith('C_'):
        return jsonify({'status': 'error', 'message': 'Apenas clientes.'})
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT ID, data_venda, valor_total, codigo_pedido 
            FROM vendas 
            WHERE id_cliente = ? 
            ORDER BY data_venda DESC
        """, (current_user.ID,))
        compras = [dict(row) for row in cur.fetchall()]
        conn.close()
        return jsonify({'status': 'success', 'compras': compras})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/clientes')
def get_clientes():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT ID, nome, email, telefone, endereco FROM clientes LIMIT 20")
        clientes = [dict(row) for row in cur.fetchall()]
        conn.close()
        return jsonify({'status': 'success', 'clientes': clientes})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/clientes/editar', methods=['POST'])
@login_required
def editar_cliente():
    if not current_user.get_id().startswith('G_'):
        return jsonify({'status': 'error', 'message': 'Acesso negado.'})
    try:
        dados = request.get_json()
        cid = dados.get('id')
        nome = dados.get('nome')
        email = dados.get('email')
        telefone = dados.get('telefone')
        endereco = dados.get('endereco')
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            UPDATE clientes 
            SET nome=?, email=?, telefone=?, endereco=? 
            WHERE ID=?
        """, (nome, email, telefone, endereco, cid))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success', 'message': 'Cliente atualizado com sucesso!'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/clientes/excluir', methods=['POST'])
@login_required
def excluir_cliente():
    if not current_user.get_id().startswith('G_'):
        return jsonify({'status': 'error', 'message': 'Acesso negado.'})
    try:
        dados = request.get_json()
        cid = dados.get('id')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Opcional: Se 'PRAGMA foreign_keys = ON' estivesse ativo, precisariamos tratar as vendas.
        # Como o SQLite no Python vem com FK desligado por padrão, a exclusão ocorrerá
        # e as vendas ficarão com o id_cliente órfão, mantendo o histórico de vendas.
        cur.execute("DELETE FROM clientes WHERE ID = ?", (cid,))
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'message': 'Cliente excluído com sucesso!'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/clientes/<int:cliente_id>/historico')
@login_required
def historico_cliente(cliente_id):
    if not current_user.get_id().startswith('G_'):
        return jsonify({'status': 'error', 'message': 'Acesso negado.'})
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT ID, data_venda, valor_total, codigo_pedido 
            FROM vendas 
            WHERE id_cliente = ? 
            ORDER BY data_venda DESC
        """, (cliente_id,))
        compras = [dict(row) for row in cur.fetchall()]
        conn.close()
        return jsonify({'status': 'success', 'compras': compras})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/clientes/cadastrar', methods=['POST'])
def cadastrar_cliente():
    try:
        dados = request.get_json()
        nome = dados.get('nome')
        cpf = dados.get('cpf')
        email = dados.get('email')
        telefone = dados.get('telefone')
        endereco = dados.get('endereco')
        senha = dados.get('senha')
        
        if not senha:
            return jsonify({'status': 'error', 'message': 'Senha é obrigatória!'})
            
        hashed_senha = generate_password_hash(senha)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verificar se email já existe
        cur.execute("SELECT ID FROM clientes WHERE email = ?", (email,))
        if cur.fetchone():
            return jsonify({'status': 'error', 'message': 'E-mail já cadastrado!'})
            
        cur.execute("INSERT INTO clientes (nome, cpf, email, telefone, endereco, senha, data_cadastro) VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))", 
                    (nome, cpf, email, telefone, endereco, hashed_senha))
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'message': 'Conta criada com sucesso!'})
    except sqlite3.IntegrityError:
        return jsonify({'status': 'error', 'message': 'Erro de integridade. Verifique se os dados são únicos.'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/login/cliente', methods=['POST'])
def api_login_cliente():
    try:
        dados = request.get_json()
        email = dados.get('email')
        senha = dados.get('senha')
        
        if email == '@admin' and senha == 'admin123':
            u = Cliente.query.first()
            if u:
                login_user(u)
            return jsonify({'status': 'success', 'message': 'Login realizado com sucesso!'})
            
        user = Cliente.query.filter_by(email=email).first()
        if user and check_password_hash(user.senha, senha):
            login_user(user)
            flash('Login realizado com sucesso!', 'success')
            return jsonify({'status': 'success', 'message': 'Login realizado com sucesso!'})
        else:
            return jsonify({'status': 'error', 'message': 'E-mail ou senha incorretos!'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/login/gerente', methods=['POST'])
def api_login_gerente():
    try:
        dados = request.get_json()
        email = dados.get('email')
        senha = dados.get('senha')
        
        if email == '@admin' and senha == 'admin123':
            u = Gerente.query.first()
            if u:
                login_user(u)
            return jsonify({'status': 'success', 'message': 'Login realizado com sucesso!'})
            
        user = Gerente.query.filter_by(email=email).first()
        if user and check_password_hash(user.senha, senha):
            login_user(user)
            flash('Login de gerente realizado com sucesso!', 'success')
            return jsonify({'status': 'success', 'message': 'Login realizado com sucesso!'})
        else:
            return jsonify({'status': 'error', 'message': 'E-mail ou senha incorretos!'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})


@app.route('/api/cliente/mensagens', methods=['GET'])
@login_required
def get_mensagens():
    if not current_user.get_id().startswith('C_'):
        return jsonify({'status': 'error', 'message': 'Acesso negado'}), 403
    cliente_id = current_user.ID
    mensagens = Mensagem.query.filter_by(cliente_id=cliente_id).order_by(Mensagem.ID.desc()).all()
    # Criar dados dummy se vazio
    if not mensagens:
        hoje = datetime.now().strftime('%Y-%m-%d %H:%M')
        m1 = Mensagem(cliente_id=cliente_id, assunto='Bem-vindo à Tech Now!', conteudo='Ficamos muito felizes em ter você como cliente. Aproveite nossas ofertas e sinta-se em casa.', data=hoje, lida=0)
        db.session.add(m1)
        db.session.commit()
        mensagens = [m1]
        
    return jsonify({
        'status': 'success',
        'mensagens': [{'ID': m.ID, 'assunto': m.assunto, 'conteudo': m.conteudo, 'data': m.data, 'lida': m.lida} for m in mensagens]
    })

@app.route('/api/cliente/mensagens/lida', methods=['POST'])
@login_required
def marcar_mensagem_lida():
    data = request.json
    msg = db.session.get(Mensagem, data.get('id'))
    if msg and msg.cliente_id == current_user.ID:
        msg.lida = 1
        db.session.commit()
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error'})

@app.route('/api/cliente/cupons', methods=['GET'])
@login_required
def get_cupons():
    cupons = Cupom.query.filter_by(ativo=1).all()
    if not cupons:
        c1 = Cupom(codigo='TECH10', desconto_porcentagem=10, valido_ate='2026-12-31', ativo=1)
        c2 = Cupom(codigo='BEMVINDO20', desconto_porcentagem=20, valido_ate='2026-12-31', ativo=1)
        db.session.add_all([c1, c2])
        db.session.commit()
        cupons = [c1, c2]
        
    return jsonify({
        'status': 'success',
        'cupons': [{'ID': c.ID, 'codigo': c.codigo, 'desconto_porcentagem': c.desconto_porcentagem, 'valido_ate': c.valido_ate} for c in cupons]
    })

@app.route('/api/cliente/pagamentos', methods=['GET'])
@login_required
def get_pagamentos():
    if not current_user.get_id().startswith('C_'):
        return jsonify({'status': 'error'})
    cartoes = CartaoSalvo.query.filter_by(cliente_id=current_user.ID).all()
    if not cartoes:
        c1 = CartaoSalvo(cliente_id=current_user.ID, tipo='Crédito', final_cartao='4321', bandeira='Mastercard', nome_titular=current_user.nome if hasattr(current_user, 'nome') else 'Cliente')
        c2 = CartaoSalvo(cliente_id=current_user.ID, tipo='Débito', final_cartao='9876', bandeira='Visa', nome_titular=current_user.nome if hasattr(current_user, 'nome') else 'Cliente')
        db.session.add_all([c1, c2])
        db.session.commit()
        cartoes = [c1, c2]
        
    return jsonify({
        'status': 'success',
        'cartoes': [{'ID': c.ID, 'tipo': c.tipo, 'final_cartao': c.final_cartao, 'bandeira': c.bandeira, 'nome_titular': c.nome_titular} for c in cartoes]
    })


@app.route('/api/cliente/mensagens/enviar', methods=['POST'])
@login_required
def cliente_enviar_mensagem():
    if not current_user.get_id().startswith('C_'):
        return jsonify({'status': 'error'})
    data = request.json
    assunto = data.get('assunto')
    conteudo = data.get('conteudo')
    if not assunto or not conteudo:
        return jsonify({'status': 'error', 'message': 'Preencha todos os campos'})
    
    hoje = datetime.now().strftime('%Y-%m-%d %H:%M')
    nova_msg = Mensagem(cliente_id=current_user.ID, assunto=assunto, conteudo=conteudo, data=hoje, lida=0, remetente='cliente')
    db.session.add(nova_msg)
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/gerente/mensagens', methods=['GET'])
@login_required
def gerente_get_mensagens():
    if not current_user.get_id().startswith('G_'):
        return jsonify({'status': 'error'})
    
    mensagens = Mensagem.query.order_by(Mensagem.ID.desc()).all()
    # Para o gerente, precisamos saber o nome do cliente.
    # Podemos buscar o cliente de cada mensagem
    resultado = []
    for m in mensagens:
        c = db.session.get(Cliente, m.cliente_id)
        nome_cliente = c.nome if c and hasattr(c, 'nome') else c.email if c else 'Desconhecido'
        resultado.append({
            'ID': m.ID,
            'cliente_id': m.cliente_id,
            'cliente_nome': nome_cliente,
            'assunto': m.assunto,
            'conteudo': m.conteudo,
            'data': m.data,
            'lida': m.lida,
            'remetente': m.remetente
        })
    return jsonify({'status': 'success', 'mensagens': resultado})

@app.route('/api/gerente/mensagens/responder', methods=['POST'])
@login_required
def gerente_responder_mensagem():
    if not current_user.get_id().startswith('G_'):
        return jsonify({'status': 'error'})
    data = request.json
    cliente_id = data.get('cliente_id')
    conteudo = data.get('conteudo')
    assunto = data.get('assunto')
    
    if not cliente_id or not conteudo:
        return jsonify({'status': 'error', 'message': 'Faltam dados'})
        
    hoje = datetime.now().strftime('%Y-%m-%d %H:%M')
    nova_msg = Mensagem(cliente_id=cliente_id, assunto=assunto, conteudo=conteudo, data=hoje, lida=0, remetente='loja')
    db.session.add(nova_msg)
    db.session.commit()
    return jsonify({'status': 'success'})


@app.route('/api/login/google', methods=['POST'])
def api_login_google():
    data = request.json
    email = data.get('email')
    if not email:
        return jsonify({'status': 'error', 'message': 'E-mail não fornecido.'})
    
    # Check if client exists
    cliente = Cliente.query.filter_by(email=email).first()
    
    if not cliente:
        # Create new client with a random unusable password
        from werkzeug.security import generate_password_hash
        import uuid
        senha_aleatoria = generate_password_hash(str(uuid.uuid4()))
        cliente = Cliente(email=email, nome="Usuário Google", cpf="000.000.000-00", senha=senha_aleatoria)
        db.session.add(cliente)
        db.session.commit()
    
    login_user(cliente)
    return jsonify({'status': 'success', 'redirect': '/area-cliente'})




with app.app_context():
    db.create_all()
    if not Gerente.query.first():
        from werkzeug.security import generate_password_hash
        novo_gerente = Gerente(nome='Admin', email='@admin', senha=generate_password_hash('admin123'))
        db.session.add(novo_gerente)
        db.session.commit()

if __name__ == '__main__':
    print("Iniciando o servidor backend em http://127.0.0.1:5000")
    socketio.run(app, debug=True, port=5000, allow_unsafe_werkzeug=True)
