// Inicializar Ícones Lucide
lucide.createIcons();

document.addEventListener("DOMContentLoaded", () => {
    // 1. Lógica do Sidebar Retrátil e Navegação de Abas
    const toggleBtn = document.getElementById("toggleSidebar");
    const sidebar = document.getElementById("sidebar");

    toggleBtn.addEventListener("click", () => {
        sidebar.classList.toggle("collapsed");
    });

    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    const viewSections = document.querySelectorAll('.view-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active das navs
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Esconde todas as views
            const targetId = item.getAttribute('data-target');
            if(targetId) {
                viewSections.forEach(view => {
                    view.classList.add('hidden');
                });
                // Mostra a view alvo
                const targetView = document.getElementById(targetId);
                if(targetView) {
                    targetView.classList.remove('hidden');
                }
            }
        });
    });

    // 2. Efeito  (Levitação) nos Cards com GSAP
    const antigravityElements = document.querySelectorAll(".antigravity-el");

    antigravityElements.forEach((el, index) => {
        // Variações aleatórias para criar um efeito orgânico
        const delay = index * 0.15;
        const duration = 3.5 + Math.random() * 1.5; // Entre 3.5s e 5s
        const yOffset = 8 + Math.random() * 6;      // Flutuação de 8px a 14px

        // Timeline principal de levitação contínua
        gsap.to(el, {
            y: `-=${yOffset}`,
            rotationX: () => -1.5 + Math.random() * 3, // Rotação 3D sutil
            rotationY: () => -1.5 + Math.random() * 3,
            duration: duration,
            yoyo: true,
            repeat: -1,
            ease: "sine.inOut",
            delay: delay
        });

        // Interação de Hover: Reação suave ao toque do mouse
        el.addEventListener("mouseenter", () => {
            gsap.to(el, {
                scale: 1.03,
                duration: 0.4,
                ease: "power3.out",
                boxShadow: "0 15px 35px -5px rgba(56, 189, 248, 0.15), 0 0 15px rgba(56, 189, 248, 0.1)",
                borderColor: "rgba(255, 255, 255, 0.15)"
            });
        });

        el.addEventListener("mouseleave", () => {
            gsap.to(el, {
                scale: 1,
                duration: 0.5,
                ease: "power2.out",
                boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.3)",
                borderColor: "rgba(255, 255, 255, 0.05)"
            });
        });
    });

    // 3. Buscar e Atualizar Métricas Reais do Banco
    function carregarDashboard() {
        fetch('/api/metrics')
            .then(response => response.json())
            .then(data => {
                if(data.status === 'success') {
                    const formatMoeda = (valor) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
                    
                    document.getElementById('val-faturamento').innerText = formatMoeda(data.faturamento);
                    document.getElementById('val-ticket').innerText = formatMoeda(data.ticket_medio);
                    document.getElementById('val-clientes').innerText = data.clientes;
                    document.getElementById('val-pedidos').innerText = data.pedidos;

                    // Atualizar Badges Comparativos (Mês Atual vs Mês Anterior)
                    const calcularVariacao = (atual, anterior) => {
                        if (anterior === 0) return atual > 0 ? '+100%' : '0%';
                        const percent = ((atual - anterior) / anterior) * 100;
                        return (percent > 0 ? '+' : '') + percent.toFixed(1) + '%';
                    };
                    
                    const setBadge = (id, percentStr) => {
                        const el = document.getElementById(id);
                        if(el) {
                            el.innerText = percentStr;
                            if(percentStr.startsWith('-')) {
                                el.className = 'badge negative';
                            } else {
                                el.className = 'badge positive';
                            }
                        }
                    };
                    
                    setBadge('badge-faturamento', calcularVariacao(data.faturamento_mes, data.faturamento_mes_ant));
                    setBadge('badge-pedidos', calcularVariacao(data.pedidos_mes, data.pedidos_mes_ant));
                    setBadge('badge-clientes', calcularVariacao(data.clientes_mes, data.clientes_mes_ant));
                    
                    const ticketMes = data.pedidos_mes > 0 ? (data.faturamento_mes / data.pedidos_mes) : 0;
                    const ticketMesAnt = data.pedidos_mes_ant > 0 ? (data.faturamento_mes_ant / data.pedidos_mes_ant) : 0;
                    setBadge('badge-ticket', calcularVariacao(ticketMes, ticketMesAnt));
                }
            })
            .catch(err => console.error("Erro ao conectar com o banco:", err));

        // Atualizar Gráfico
        const diasFiltro = document.getElementById('filtro-vendas') ? document.getElementById('filtro-vendas').value : '7';
        fetch(`/api/chart-vendas?dias=${diasFiltro}`)
            .then(response => response.json())
            .then(data => {
                if(data.status === 'success' && vendasChart) {
                    vendasChart.data.labels = data.labels;
                    vendasChart.data.datasets[0].data = data.data;
                    vendasChart.update();
                }
                if(data.status === 'success' && window.resumoVendasChartInst) {
                    window.resumoVendasChartInst.data.labels = data.labels;
                    window.resumoVendasChartInst.data.datasets[0].data = data.data;
                    window.resumoVendasChartInst.update();
                }
            });

        // Atualizar Tabelas de Produtos e Estoque
        fetch(`/api/produtos?dias=${diasFiltro}`)
            .then(response => response.json())
            .then(data => {
                const tbody = document.getElementById('admin-produtos-tbody');
                const tbodyEstoque = document.getElementById('admin-estoque-tbody');
                
                if(data.status === 'success' && data.produtos.length > 0) {
                    if(tbody) tbody.innerHTML = '';
                    if(tbodyEstoque) tbodyEstoque.innerHTML = '';
                    
                    const formatMoeda = (valor) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
                    
                    data.produtos.forEach(prod => {
                        // Tabela de Produtos (Aba Produtos)
                        if(tbody) {
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td><span style="font-weight: 500;">${prod.nome_produto}</span><br><small style="color: var(--text-secondary);">${prod.categoria}</small></td>
                                <td>${formatMoeda(prod.preco)}</td>
                                <td><span class="status-badge status-instock">${prod.quantidade_estoque} un.</span></td>
                                <td><button class="icon-btn" onclick="prepararEdicao(${prod.ID}, '${prod.nome_produto}', '${prod.categoria}', ${prod.preco}, ${prod.quantidade_estoque})" style="padding: 4px;"><i data-lucide="edit-2" style="width: 14px; height: 14px;"></i></button></td>
                            `;
                            tbody.appendChild(tr);
                        }
                        
                        // Tabela de Estoque (Aba Estoque)
                        if(tbodyEstoque) {
                            let statusClass = 'status-instock';
                            let statusText = 'Adequado';
                            if(prod.quantidade_estoque === 0) {
                                statusClass = 'status-outstock';
                                statusText = 'Esgotado';
                            } else if(prod.quantidade_estoque < 10) {
                                statusClass = 'status-lowstock';
                                statusText = 'Baixo';
                            }
                            
                            const isAtivo = prod.ativo === 1;
                            const btnLabel = isAtivo ? 'Desativar' : 'Ativar';
                            const btnCor = isAtivo ? 'var(--rose-500)' : 'var(--emerald-500)';

                            const trEstoque = document.createElement('tr');
                            trEstoque.innerHTML = `
                                <td>
                                    <span style="font-weight: 500; ${!isAtivo ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${prod.nome_produto}</span>
                                    ${!isAtivo ? '<br><small style="color: var(--rose-400);">Inativo na Loja</small>' : ''}
                                </td>
                                <td style="color: var(--text-secondary);">${prod.categoria}</td>
                                <td><strong style="font-size: 1.1rem;">${prod.quantidade_estoque}</strong> un.</td>
                                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                                <td style="display: flex; gap: 8px; align-items: center;">
                                    <button class="btn-secondary" onclick="alterarStatusProduto(${prod.ID}, ${isAtivo ? 0 : 1})" style="padding: 6px 10px; font-size: 0.75rem; border-color: ${btnCor}; color: ${btnCor};">${btnLabel}</button>
                                    <input type="number" id="qtd-add-${prod.ID}" value="5" min="1" class="glass-input" style="width: 70px; padding: 6px; border-radius: 6px;">
                                    <button class="btn-primary" onclick="adicionarEstoque(${prod.ID})" style="padding: 6px 14px; font-size: 0.8rem;">+ Adicionar</button>
                                </td>
                            `;
                            tbodyEstoque.appendChild(trEstoque);
                        }
                    });
                    
                    // Renderizar Gráfico de Pizza de Estoque
                    const categoriasCount = {};
                    data.produtos.forEach(prod => {
                        if (prod.ativo === 1) { // Conta apenas os ativos
                            if (!categoriasCount[prod.categoria]) categoriasCount[prod.categoria] = 0;
                            categoriasCount[prod.categoria] += prod.quantidade_estoque;
                        }
                    });

                    const pieLabels = Object.keys(categoriasCount);
                    const pieData = Object.values(categoriasCount);
                    
                    const ctxEstoque = document.getElementById('estoqueChart');
                    const ctxResumoEstoque = document.getElementById('resumoEstoqueChart');
                    if (ctxResumoEstoque) {
                        if (window.resumoEstoquePieChart) {
                            window.resumoEstoquePieChart.data.labels = pieLabels;
                            window.resumoEstoquePieChart.data.datasets[0].data = pieData;
                            window.resumoEstoquePieChart.update();
                        } else {
                            window.resumoEstoquePieChart = new Chart(ctxResumoEstoque, {
                                type: 'doughnut',
                                data: { labels: pieLabels, datasets: [{ data: pieData, backgroundColor: ['rgba(16,185,129,0.8)','rgba(139,92,246,0.8)','rgba(59,130,246,0.8)','rgba(244,63,94,0.8)','rgba(245,158,11,0.8)','rgba(6,182,212,0.8)'], borderColor: 'rgba(255,255,255,0.05)', borderWidth: 1 }] },
                                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '70%' }
                            });
                        }
                    }
                    if (ctxEstoque) {
                        if (window.estoquePieChart) {
                            window.estoquePieChart.data.labels = pieLabels;
                            window.estoquePieChart.data.datasets[0].data = pieData;
                            window.estoquePieChart.update();
                        } else {
                            window.estoquePieChart = new Chart(ctxEstoque, {
                                type: 'doughnut',
                                data: {
                                    labels: pieLabels,
                                    datasets: [{
                                        data: pieData,
                                        backgroundColor: [
                                            'rgba(16, 185, 129, 0.8)',  // emerald
                                            'rgba(139, 92, 246, 0.8)',  // purple
                                            'rgba(59, 130, 246, 0.8)',  // blue
                                            'rgba(244, 63, 94, 0.8)',   // rose
                                            'rgba(245, 158, 11, 0.8)',  // amber
                                            'rgba(6, 182, 212, 0.8)'    // cyan
                                        ],
                                        borderColor: 'rgba(255, 255, 255, 0.05)',
                                        borderWidth: 2
                                    }]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: {
                                            position: 'bottom',
                                            labels: { color: '#a1a1aa', padding: 12, font: { size: 10 } }
                                        }
                                    },
                                    cutout: '65%'
                                }
                            });
                        }
                    }

                    // Atualizar Datalist de Categorias para permitir criar novas facilmente
                    const uniqueCategories = [...new Set(data.produtos.map(p => p.categoria))].sort();
                    const datalist = document.getElementById('categorias-list');
                    if(datalist) {
                        datalist.innerHTML = '';
                        uniqueCategories.forEach(cat => {
                            if(cat) {
                                const option = document.createElement('option');
                                option.value = cat;
                                datalist.appendChild(option);
                            }
                        });
                    }

                    // Renderizar Gráfico de Barras de Preços
                    const produtosBarChartCtx = document.getElementById('produtosBarChart');
                    
                    if (produtosBarChartCtx) {
                        // Pega os top 10 com maior faturamento
                        const topProdutos = [...data.produtos].sort((a, b) => b.faturamento_total - a.faturamento_total).slice(0, 10);
                        const barLabels = topProdutos.map(p => p.nome_produto.length > 15 ? p.nome_produto.substring(0, 15) + '...' : p.nome_produto);
                        const barData = topProdutos.map(p => p.faturamento_total);

                        if (window.produtosBarChartInstance) {
                            window.produtosBarChartInstance.data.labels = barLabels;
                            window.produtosBarChartInstance.data.datasets[0].data = barData;
                            window.produtosBarChartInstance.update();
                        } else {
                            window.produtosBarChartInstance = new Chart(produtosBarChartCtx, {
                                type: 'bar',
                                data: {
                                    labels: barLabels,
                                    datasets: [{
                                        label: 'Faturamento (R$)',
                                        data: barData,
                                        backgroundColor: 'rgba(139, 92, 246, 0.7)', // Purple theme
                                        borderColor: 'rgba(139, 92, 246, 1)',
                                        borderWidth: 1,
                                        borderRadius: 6
                                    }]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: { display: false },
                                        tooltip: {
                                            callbacks: {
                                                label: function(context) {
                                                    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.raw);
                                                }
                                            }
                                        }
                                    },
                                    scales: {
                                        y: {
                                            beginAtZero: true,
                                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                            ticks: { color: '#a1a1aa' }
                                        },
                                        x: {
                                            grid: { display: false },
                                            ticks: { color: '#a1a1aa', maxRotation: 45, minRotation: 45 }
                                        }
                                    }
                                }
                            });
                        }
                        
                        const ctxResumoProdutos = document.getElementById('resumoProdutosChart');
                        if (ctxResumoProdutos) {
                            if (window.resumoProdutosBarChart) {
                                window.resumoProdutosBarChart.data.labels = barLabels;
                                window.resumoProdutosBarChart.data.datasets[0].data = barData;
                                window.resumoProdutosBarChart.update();
                            } else {
                                window.resumoProdutosBarChart = new Chart(ctxResumoProdutos, {
                                    type: 'bar',
                                    data: { labels: barLabels, datasets: [{ data: barData, backgroundColor: 'rgba(139,92,246,0.7)', borderRadius: 4 }] },
                                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
                                });
                            }
                        }
                    }

                    lucide.createIcons();
                } else {
                    if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="loading-text">Nenhum produto cadastrado.</td></tr>';
                    if(tbodyEstoque) tbodyEstoque.innerHTML = '<tr><td colspan="5" class="loading-text">Nenhum produto cadastrado.</td></tr>';
                }
            });

        // Atualizar Tabela de Clientes
        fetch('/api/clientes')
            .then(response => response.json())
            .then(data => {
                const tbody = document.getElementById('admin-clientes-tbody');
                if(tbody) {
                    if(data.status === 'success' && data.clientes.length > 0) {
                        tbody.innerHTML = '';
                        data.clientes.forEach(cliente => {
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td><span style="font-weight: 500;">${cliente.nome}</span><br><small style="color: var(--text-secondary);">ID: #${cliente.ID}</small></td>
                                <td>${cliente.email}</td>
                                <td>${cliente.telefone || '-'}</td>
                                <td><span style="color: var(--text-secondary);">${cliente.endereco || '-'}</span></td>
                                <td style="display: flex; gap: 8px;">
                                    <button class="icon-btn" title="Editar Cliente" onclick="editarClienteModal(${cliente.ID}, '${cliente.nome}', '${cliente.email}', '${cliente.telefone || ''}', '${cliente.endereco || ''}')" style="padding: 4px;"><i data-lucide="edit-2" style="width: 14px; height: 14px;"></i></button>
                                    <button class="icon-btn" title="Histórico de Compras" onclick="verHistoricoCliente(${cliente.ID}, '${cliente.nome}')" style="padding: 4px;"><i data-lucide="clock" style="width: 14px; height: 14px;"></i></button>
                                    <button class="icon-btn" title="Excluir Cliente" onclick="excluirCliente(${cliente.ID}, '${cliente.nome}')" style="padding: 4px; color: var(--rose-400);"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
                                </td>
                            `;
                            tbody.appendChild(tr);
                        });
                        lucide.createIcons();
                    } else {
                        tbody.innerHTML = '<tr><td colspan="5" class="loading-text">Nenhum cliente encontrado.</td></tr>';
                    }
                }
            });

        // Atualizar Tabela de Vendas
        fetch('/api/vendas')
            .then(response => response.json())
            .then(data => {
                const tbodyVendas = document.getElementById('tabela-todas-vendas');
                if(tbodyVendas) {
                    if(data.status === 'success' && data.vendas.length > 0) {
                        tbodyVendas.innerHTML = '';
                        const formatMoeda = (valor) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
                        
                        data.vendas.forEach(venda => {
                            const dataObj = new Date(venda.data_venda);
                            const dataFormatada = dataObj.toLocaleDateString('pt-BR') + ' às ' + dataObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                            
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td><span style="font-weight: 600; color: var(--emerald-400);">${venda.codigo_pedido}</span></td>
                                <td style="color: var(--text-secondary);">${dataFormatada}</td>
                                <td>${venda.cliente_nome}</td>
                                <td style="font-weight: 600; color: var(--emerald-400);">${formatMoeda(venda.valor_total)}</td>
                            `;
                            tbodyVendas.appendChild(tr);
                        });
                    } else {
                        tbodyVendas.innerHTML = '<tr><td colspan="4" class="loading-text">Nenhuma venda encontrada.</td></tr>';
                    }
                }
            });
    }

    carregarDashboard();
    setInterval(carregarDashboard, 3000); // Atualiza os números sozinho a cada 3 segundos

    // Variável Global para controle de edição
    window.editingProductId = null;

    window.prepararEdicao = function(id, nome, categoria, preco, estoque) {
        window.editingProductId = id;
        document.getElementById('cad-nome').value = nome;
        document.getElementById('cad-categoria').value = categoria;
        document.getElementById('cad-preco').value = preco;
        document.getElementById('cad-estoque').value = estoque;
        
        document.getElementById('form-titulo').innerText = 'Editar Produto';
        document.getElementById('btn-cancelar-edit').classList.remove('hidden');
        document.querySelector('#form-cadastrar-produto button[type="submit"]').innerText = 'Salvar Alterações';
        
        // Mostrar gerenciador de imagens
        abrirGerenciadorImagens(id, nome);
        
        // Focar no formulário suavemente
        document.getElementById('form-titulo').scrollIntoView({ behavior: 'smooth' });
    };

    window.cancelarEdicao = function() {
        window.editingProductId = null;
        document.getElementById('form-cadastrar-produto').reset();
        document.getElementById('form-titulo').innerText = 'Novo Produto';
        document.getElementById('btn-cancelar-edit').classList.add('hidden');
        document.querySelector('#form-cadastrar-produto button[type="submit"]').innerText = 'Cadastrar na Loja';
        fecharGerenciadorImagens();
    };

    // 5. Cadastrar / Editar Produto
    const formCadastrar = document.getElementById('form-cadastrar-produto');
    if(formCadastrar) {
        formCadastrar.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = formCadastrar.querySelector('button[type="submit"]');
            const isEditing = window.editingProductId !== null;
            btn.innerHTML = isEditing ? 'Salvando...' : 'Cadastrando...';
            btn.disabled = true;

            const dados = {
                id: window.editingProductId,
                nome: document.getElementById('cad-nome').value,
                categoria: document.getElementById('cad-categoria').value,
                preco: document.getElementById('cad-preco').value,
                estoque: document.getElementById('cad-estoque').value
            };

            const url = isEditing ? '/api/produtos/editar' : '/api/produtos/cadastrar';

            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            })
            .then(res => res.json())
            .then(data => {
                if(data.status === 'success') {
                    if(isEditing) {
                        alert(data.message);
                        window.cancelarEdicao();
                    } else {
                        // Novo produto cadastrado: mostrar gerenciador de imagens
                        formCadastrar.reset();
                        if(data.produto_id) {
                            abrirGerenciadorImagens(data.produto_id, dados.nome);
                            alert(data.message + ' Agora adicione as fotos do produto abaixo.');
                        } else {
                            alert(data.message);
                        }
                    }
                    carregarDashboard(); // Atualiza a tabela na hora
                } else {
                    alert('Erro: ' + data.message);
                }
            })
            .finally(() => {
                btn.innerHTML = window.editingProductId !== null ? 'Salvar Alterações' : 'Cadastrar na Loja';
                btn.disabled = false;
            });
        });
    }

    // --- GERENCIADOR DE IMAGENS DO PRODUTO ---
    window.currentImageProductId = null;

    function abrirGerenciadorImagens(produtoId, nomeProduto) {
        window.currentImageProductId = produtoId;
        const container = document.getElementById('gerenciador-imagens');
        if(!container) return;
        container.classList.remove('hidden');
        container.style.display = 'block';
        document.getElementById('img-produto-nome').innerText = nomeProduto || '';
        carregarImagensProduto(produtoId);
        lucide.createIcons();
    }

    function fecharGerenciadorImagens() {
        window.currentImageProductId = null;
        const container = document.getElementById('gerenciador-imagens');
        if(!container) return;
        container.classList.add('hidden');
        container.style.display = 'none';
        // Reset slots
        for(let i = 1; i <= 3; i++) {
            resetSlot(i);
        }
    }

    function resetSlot(slot) {
        const preview = document.getElementById('preview-img-' + slot);
        const placeholder = document.getElementById('placeholder-' + slot);
        const actions = document.getElementById('actions-img-' + slot);
        const input = document.getElementById('input-img-' + slot);
        if(preview) { preview.style.display = 'none'; preview.src = ''; }
        if(placeholder) placeholder.style.display = 'block';
        if(actions) { actions.classList.add('hidden'); actions.style.display = 'none'; }
        if(input) input.value = '';
    }

    function mostrarSlotComImagem(slot, url) {
        const preview = document.getElementById('preview-img-' + slot);
        const placeholder = document.getElementById('placeholder-' + slot);
        const actions = document.getElementById('actions-img-' + slot);
        if(preview) { preview.src = url + '?t=' + Date.now(); preview.style.display = 'block'; }
        if(placeholder) placeholder.style.display = 'none';
        if(actions) { actions.classList.remove('hidden'); actions.style.display = 'flex'; }
    }

    function carregarImagensProduto(produtoId) {
        // Reset all slots first
        for(let i = 1; i <= 3; i++) resetSlot(i);

        fetch('/api/produtos/' + produtoId + '/imagens')
            .then(r => r.json())
            .then(data => {
                if(data.status === 'success') {
                    data.imagens.forEach(img => {
                        mostrarSlotComImagem(img.slot, img.url);
                    });
                }
                lucide.createIcons();
            });
    }

    window.uploadImagem = function(slot) {
        const input = document.getElementById('input-img-' + slot);
        if(!input.files[0] || !window.currentImageProductId) return;

        const formData = new FormData();
        formData.append('imagem', input.files[0]);
        formData.append('slot', slot);

        fetch('/api/produtos/' + window.currentImageProductId + '/imagem/upload', {
            method: 'POST',
            body: formData
        })
        .then(r => r.json())
        .then(data => {
            if(data.status === 'success') {
                mostrarSlotComImagem(slot, data.url);
            } else {
                alert('Erro: ' + data.message);
            }
        });
    };

    window.trocarImagem = function(slot) {
        document.getElementById('input-img-' + slot).click();
    };

    window.excluirImagem = function(slot) {
        if(!window.currentImageProductId) return;
        if(!confirm('Tem certeza que deseja excluir esta imagem?')) return;

        fetch('/api/produtos/' + window.currentImageProductId + '/imagem/excluir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slot: slot })
        })
        .then(r => r.json())
        .then(data => {
            if(data.status === 'success') {
                resetSlot(slot);
            } else {
                alert('Erro: ' + data.message);
            }
        });
    };

    // Click nos slots vazios abre o seletor de arquivo
    document.querySelectorAll('.img-slot').forEach(slot => {
        slot.addEventListener('click', (e) => {
            // Não acionar se clicou nos botões de ação
            if(e.target.closest('button')) return;
            const slotNum = slot.dataset.slot;
            const preview = document.getElementById('preview-img-' + slotNum);
            // Só abrir seletor se não houver imagem
            if(preview && preview.style.display === 'none') {
                document.getElementById('input-img-' + slotNum).click();
            }
        });
    });

    // --- FUNÇÕES DE ESTOQUE RÁPIDO ---
    window.adicionarEstoque = function(id) {
        const input = document.getElementById(`qtd-add-${id}`);
        const qtdAdicionar = parseInt(input.value);
        
        if (isNaN(qtdAdicionar) || qtdAdicionar <= 0) {
            alert('Insira uma quantidade válida maior que zero.');
            return;
        }
        
        const btn = input.nextElementSibling;
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader" class="rotating"></i>';
        lucide.createIcons();
        btn.disabled = true;

        fetch('/api/estoque/adicionar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, quantidade: qtdAdicionar })
        })
        .then(res => res.json())
        .then(data => {
            if(data.status === 'success') {
                carregarDashboard(); // recarrega a tabela imediatamente
            } else {
                alert('Erro: ' + data.message);
                btn.innerHTML = textoOriginal;
                btn.disabled = false;
            }
        })
        .catch(err => {
            alert('Erro de conexão.');
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        });
    };

    window.alterarStatusProduto = function(id, novoStatus) {
        fetch('/api/estoque/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, ativo: novoStatus })
        })
        .then(res => res.json())
        .then(data => {
            if(data.status === 'success') {
                carregarDashboard();
            } else {
                alert('Erro: ' + data.message);
            }
        });
    };

    // --- FUNÇÕES DE CLIENTES ---
    window.editarClienteModal = function(id, nome, email, telefone, endereco) {
        document.getElementById('edit-cli-id').value = id;
        document.getElementById('edit-cli-nome').value = nome;
        document.getElementById('edit-cli-email').value = email;
        document.getElementById('edit-cli-telefone').value = telefone;
        document.getElementById('edit-cli-endereco').value = endereco;
        
        const modal = document.getElementById('modal-edit-cliente');
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    };

    window.verHistoricoCliente = function(id, nome) {
        document.getElementById('hist-cli-nome').innerText = `Compras: ${nome}`;
        const modal = document.getElementById('modal-hist-cliente');
        modal.style.display = 'flex';
        modal.classList.remove('hidden');

        const tbody = document.getElementById('hist-cli-tbody');
        tbody.innerHTML = '<tr><td colspan="3" class="loading-text">Buscando histórico...</td></tr>';

        fetch(`/api/clientes/${id}/historico`)
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success' && data.compras.length > 0) {
                    tbody.innerHTML = '';
                    const formatMoeda = (valor) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
                    data.compras.forEach(compra => {
                        const dataObj = new Date(compra.data_venda);
                        const dataFormatada = dataObj.toLocaleDateString('pt-BR') + ' às ' + dataObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                        
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td><span style="font-weight: 600; color: var(--emerald-400);">${compra.codigo_pedido}</span></td>
                            <td style="color: var(--text-secondary);">${dataFormatada}</td>
                            <td style="color: var(--emerald-400); font-weight: 500;">${formatMoeda(compra.valor_total)}</td>
                        `;
                        tbody.appendChild(tr);
                    });
                } else {
                    tbody.innerHTML = '<tr><td colspan="3" class="loading-text">Este cliente ainda não fez nenhuma compra.</td></tr>';
                }
            })
            .catch(err => {
                tbody.innerHTML = '<tr><td colspan="3" class="loading-text" style="color: var(--rose-400);">Erro ao carregar histórico.</td></tr>';
            });
    };

    window.fecharModalCliente = function(tipo) {
        const modal = document.getElementById(`modal-${tipo}-cliente`);
        modal.style.display = 'none';
        modal.classList.add('hidden');
    };

    window.excluirCliente = function(id, nome) {
        if(confirm(`Tem certeza que deseja excluir o cliente '${nome}' (ID: #${id})?\nEsta ação não poderá ser desfeita e todas as vendas associadas serão mantidas para fins de relatório.`)) {
            fetch('/api/clientes/excluir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id })
            })
            .then(res => res.json())
            .then(data => {
                if(data.status === 'success') {
                    alert('Cliente excluído com sucesso!');
                    carregarDashboard();
                } else {
                    alert('Erro ao excluir: ' + data.message);
                }
            })
            .catch(err => {
                alert('Erro de conexão ao excluir cliente.');
            });
        }
    };

    const formEditCliente = document.getElementById('form-edit-cliente');
    if (formEditCliente) {
        formEditCliente.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = formEditCliente.querySelector('button[type="submit"]');
            btn.innerHTML = 'Salvando...';
            btn.disabled = true;

            const dados = {
                id: document.getElementById('edit-cli-id').value,
                nome: document.getElementById('edit-cli-nome').value,
                email: document.getElementById('edit-cli-email').value,
                telefone: document.getElementById('edit-cli-telefone').value,
                endereco: document.getElementById('edit-cli-endereco').value
            };

            fetch('/api/clientes/editar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    alert(data.message);
                    window.fecharModalCliente('edit');
                    carregarDashboard(); // Atualiza a tabela na hora
                } else {
                    alert('Erro: ' + data.message);
                }
            })
            .finally(() => {
                btn.innerHTML = 'Salvar Alterações';
                btn.disabled = false;
            });
        });
    }

    // 6. Inicializar o Gráfico (Vazio primeiro, vai preencher via carregarDashboard)
    let vendasChart = null;
    const diasIniciais = document.getElementById('filtro-vendas') ? document.getElementById('filtro-vendas').value : '30';
    fetch(`/api/chart-vendas?dias=${diasIniciais}`)
        .then(response => response.json())
        .then(data => {
            if(data.status === 'success') {
                const ctx = document.getElementById('vendasChart').getContext('2d');
                const ctxResumo = document.getElementById('resumoVendasChart');
                if(ctxResumo) {
                    const gradientResumo = ctxResumo.getContext('2d').createLinearGradient(0, 0, 0, 200);
                    gradientResumo.addColorStop(0, 'rgba(14, 165, 233, 0.5)');
                    gradientResumo.addColorStop(1, 'rgba(14, 165, 233, 0.0)');
                    if(window.resumoVendasChartInst) {
                        window.resumoVendasChartInst.data.labels = data.labels;
                        window.resumoVendasChartInst.data.datasets[0].data = data.data;
                        window.resumoVendasChartInst.update();
                    } else {
                        window.resumoVendasChartInst = new Chart(ctxResumo, {
                            type: 'line',
                            data: { labels: data.labels, datasets: [{ data: data.data, borderColor: '#0ea5e9', backgroundColor: gradientResumo, fill: true, tension: 0.4, pointRadius: 0 }] },
                            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
                        });
                    }
                }
                
                // Gradiente para o gráfico
                const gradient = ctx.createLinearGradient(0, 0, 0, 400);
                gradient.addColorStop(0, 'rgba(14, 165, 233, 0.5)'); // sky-500
                gradient.addColorStop(1, 'rgba(14, 165, 233, 0.0)');
                
                vendasChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.labels,
                        datasets: [{
                            label: 'Faturamento Diário (R$)',
                            data: data.data,
                            borderColor: '#0ea5e9',
                            backgroundColor: gradient,
                            borderWidth: 3,
                            pointBackgroundColor: '#0ea5e9',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                            pointRadius: 5,
                            pointHoverRadius: 7,
                            fill: true,
                            tension: 0.4 // Curva suave
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                                titleColor: '#fff',
                                bodyColor: '#cbd5e1',
                                padding: 12,
                                borderColor: 'rgba(255,255,255,0.1)',
                                borderWidth: 1,
                                displayColors: false,
                                callbacks: {
                                    label: function(context) {
                                        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: { color: '#94a3b8' }
                            },
                            x: {
                                grid: { display: false },
                                ticks: { color: '#94a3b8' }
                            }
                        }
                    }
                });
            }
        });

    // Permitir abrir abas diretamente pela URL (Ex: /#view-produtos)
    if (window.location.hash) {
        const targetId = window.location.hash.substring(1);
        const link = document.querySelector(`.sidebar-nav .nav-item[data-target="${targetId}"]`);
        if(link) {
            link.click();
        }
    }

    // Carregar configurações iniciais
    fetch('/api/configuracoes')
        .then(res => res.json())
        .then(data => {
            if(data.status === 'success') {
                document.getElementById('config-nome').value = data.nome_loja || 'Tech Now';
                document.getElementById('config-email').value = data.email_suporte || 'suporte@technow.com.br';
                const cb = document.getElementById('config-manutencao');
                cb.checked = data.modo_manutencao;
                // dispara o onchange manual
                if(typeof toggleManutencaoUI === 'function') toggleManutencaoUI(cb);
            }
        });
});

window.salvarConfiguracoes = function() {
    const btn = document.getElementById('btn-salvar-config');
    btn.innerHTML = '<i data-lucide="loader" class="rotating"></i> Salvando...';
    btn.disabled = true;

    const payload = {
        nome_loja: document.getElementById('config-nome').value,
        email_suporte: document.getElementById('config-email').value,
        modo_manutencao: document.getElementById('config-manutencao').checked
    };

    fetch('/api/configuracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success') {
            alert('Configurações salvas com sucesso!');
        } else {
            alert('Erro: ' + data.message);
        }
    })
    .finally(() => {
        btn.innerHTML = 'Salvar Alterações';
        btn.disabled = false;
        lucide.createIcons();
    });
};

// Lógica de Mensagens (Gerente)
function carregarMensagensGerente() {
    fetch('/api/gerente/mensagens')
        .then(res => res.json())
        .then(data => {
            const tbody = document.getElementById('tabela-mensagens-gerente');
            if(data.status === 'success' && data.mensagens.length > 0) {
                tbody.innerHTML = '';
                data.mensagens.forEach(msg => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><span style="font-size: 0.8rem; color: var(--text-secondary);">${msg.data}</span></td>
                        <td><strong>${msg.cliente_nome}</strong><br><span style="font-size: 0.75rem; color: var(--text-secondary);">ID: ${msg.cliente_id}</span></td>
                        <td>${msg.assunto}</td>
                        <td>
                            <span class="status-badge" style="background: ${msg.remetente === 'cliente' ? 'rgba(59,130,246,0.1)' : 'rgba(139,92,246,0.1)'}; color: ${msg.remetente === 'cliente' ? 'var(--blue-400)' : 'var(--purple-400)'}; font-size:0.7rem; padding: 2px 6px; margin-right: 5px;">
                                ${msg.remetente === 'cliente' ? 'Cliente' : 'Loja'}
                            </span>
                            ${msg.conteudo}
                        </td>
                        <td>
                            ${msg.remetente === 'cliente' ? `<button onclick="abrirResposta(${msg.cliente_id}, '${msg.assunto.replace(/'/g, "\'")}')" class="btn-primary" style="padding: 4px 8px; font-size: 0.75rem;">Responder</button>` : '<span style="color:var(--text-secondary); font-size:0.8rem;">Enviado</span>'}
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="5" class="loading-text">Nenhuma mensagem encontrada.</td></tr>';
            }
        });
}

function abrirResposta(cliente_id, assunto_original) {
    const resposta = prompt(`Respondendo ao Cliente #${cliente_id} sobre "${assunto_original}"\nDigite a sua resposta:`);
    if(resposta) {
        fetch('/api/gerente/mensagens/responder', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                cliente_id: cliente_id,
                assunto: 'Re: ' + assunto_original,
                conteudo: resposta
            })
        }).then(res => res.json()).then(data => {
            if(data.status === 'success') {
                alert('Resposta enviada com sucesso!');
                carregarMensagensGerente();
            } else {
                alert('Erro ao enviar.');
            }
        });
    }
}
