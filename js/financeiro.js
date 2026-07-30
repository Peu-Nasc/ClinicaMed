import { clinicaState } from './state.js';
import { formatCurrency, showToast } from './Ferramentas.js';
import { db, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from './firebase.js';

let lancamentoEmEdicaoId = null;

export function initFinanceiro() {
    const modalFinanceiro = document.getElementById('modal-financeiro');
    
    document.getElementById('btn-abrir-modal-financeiro').addEventListener('click', () => {
        const hoje = new Date().toISOString().split('T')[0];
        document.getElementById('fin-competencia').value = hoje;
        document.getElementById('fin-caixa').value = hoje;
        modalFinanceiro.classList.add('active');
    });

    document.getElementById('btn-close-financeiro').addEventListener('click', () => modalFinanceiro.classList.remove('active'));

    // ========================================================
    // LISTENERS DO DASHBOARD PRINCIPAL
    // ========================================================
    const filtroPeriodo = document.getElementById('dash-filtro-periodo');
    const filtroDataEsp = document.getElementById('dash-data-especifica');

    if (filtroPeriodo) {
        filtroPeriodo.addEventListener('change', (e) => {
            if (e.target.value === 'especifico') {
                filtroDataEsp.style.display = 'block';
                if (!filtroDataEsp.value) {
                    const hoje = new Date();
                    filtroDataEsp.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
                }
            } else {
                filtroDataEsp.style.display = 'none';
            }
            calcularDRE(); 
        });
    }

    if (filtroDataEsp) {
        filtroDataEsp.addEventListener('change', calcularDRE);
    }

    // ========================================================
    // NOVO: LISTENERS DO FILTRO LOCAL (Aba Financeiro)
    // ========================================================
    const searchFin = document.getElementById('search-financeiro');
    const mesFin = document.getElementById('filtro-mes-financeiro');

    if (searchFin) {
        searchFin.addEventListener('input', (e) => {
            atualizarTabelaFinanceiro(e.target.value.toLowerCase(), mesFin ? mesFin.value : 'todos');
        });
    }
    if (mesFin) {
        mesFin.addEventListener('change', (e) => {
            atualizarTabelaFinanceiro(searchFin ? searchFin.value.toLowerCase() : '', e.target.value);
        });
    }

    // ========================================================
    // FORMULÁRIO DE LANÇAMENTOS
    // ========================================================
    document.getElementById('form-financeiro').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btnSalvar = e.target.querySelector('button[type="submit"]');
        const textoOriginal = btnSalvar.innerHTML;
        btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Lançando...';
        btnSalvar.disabled = true;
        
        let valorInput = document.getElementById('fin-valor').value;
        if (typeof valorInput === 'string') {
            valorInput = valorInput.replace(/\./g, '').replace(',', '.');
        }

        try {
            const dadosParaSalvar = {
                tipo: document.getElementById('fin-tipo').value,
                vinculo: document.getElementById('fin-vinculo').value,
                pagamento: document.getElementById('fin-pagamento').value,
                status: document.getElementById('fin-status').value,
                competencia: document.getElementById('fin-competencia').value,
                caixa: document.getElementById('fin-caixa').value,
                valor: parseFloat(valorInput),
                clinicaId: clinicaState.sessao.clinicaId
            };

            if (lancamentoEmEdicaoId) {
                await updateDoc(doc(db, "financeiro", lancamentoEmEdicaoId), dadosParaSalvar);
                showToast('Lançamento atualizado e DRE recalculada!', 'success');
            } else {
                await addDoc(collection(db, "financeiro"), dadosParaSalvar);
                showToast('Lançamento registrado na nuvem com sucesso.', 'success');
            }
            
            modalFinanceiro.classList.remove('active');
            e.target.reset();
            lancamentoEmEdicaoId = null; 
            
            await carregarFinanceiro(); 
            
        } catch (error) {
            console.error("Erro no caixa: ", error);
            showToast('Falha ao registrar lançamento financeiro.', 'error');
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    });

    const financeTableBody = document.getElementById('finance-table-body');
    if (financeTableBody) {
        financeTableBody.addEventListener('click', async (e) => {
            const btnEditar = e.target.closest('.btn-editar-fin');
            const btnExcluir = e.target.closest('.btn-excluir-fin');

            if (btnExcluir) {
                const idFin = btnExcluir.getAttribute('data-id');
                if (confirm('Atenção: Deseja realmente excluir este lançamento financeiro? Essa ação recalculará a sua DRE imediatamente.')) {
                    try {
                        await deleteDoc(doc(db, "financeiro", idFin));
                        showToast('Lançamento excluído com sucesso.', 'success');
                        await carregarFinanceiro();
                    } catch (error) {
                        console.error("Erro ao excluir: ", error);
                        showToast('Falha ao excluir lançamento.', 'error');
                    }
                }
            }

            if (btnEditar) {
                const idFin = btnEditar.getAttribute('data-id');
                const lancamento = clinicaState.financeiro.lancamentos.find(l => String(l.id) === String(idFin));
                
                if (lancamento) {
                    lancamentoEmEdicaoId = lancamento.id; 
                    
                    document.getElementById('fin-tipo').value = lancamento.tipo;
                    document.getElementById('fin-vinculo').value = lancamento.vinculo;
                    document.getElementById('fin-pagamento').value = lancamento.pagamento;
                    document.getElementById('fin-status').value = lancamento.status;
                    document.getElementById('fin-competencia').value = lancamento.competencia;
                    document.getElementById('fin-caixa').value = lancamento.caixa;
                    
                    document.getElementById('fin-valor').value = lancamento.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    
                    document.getElementById('modal-financeiro').classList.add('active');
                }
            }
        });
    }

    document.getElementById('btn-close-financeiro').addEventListener('click', () => {
        document.getElementById('modal-financeiro').classList.remove('active');
        lancamentoEmEdicaoId = null; 
        document.getElementById('form-financeiro').reset();
    });
}

// NOVA DRE INTELIGENTE (Com filtros de data para o Dashboard principal)
export function calcularDRE() {
    const filtroPeriodo = document.getElementById('dash-filtro-periodo') ? document.getElementById('dash-filtro-periodo').value : 'mes';
    const dataEspecifica = document.getElementById('dash-data-especifica') ? document.getElementById('dash-data-especifica').value : '';

    const getIsoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    const hojeObj = new Date();
    const hojeIso = getIsoDate(hojeObj);

    const ontemObj = new Date(hojeObj);
    ontemObj.setDate(ontemObj.getDate() - 1);
    const ontemIso = getIsoDate(ontemObj);

    const semanaObj = new Date(hojeObj);
    semanaObj.setDate(semanaObj.getDate() - 7);
    const semanaIso = getIsoDate(semanaObj);

    const mesObj = new Date(hojeObj);
    mesObj.setDate(mesObj.getDate() - 30);
    const mesIso = getIsoDate(mesObj);

    const dataDentroDoFiltro = (dataAComparar) => {
        if (!dataAComparar) return false;
        switch(filtroPeriodo) {
            case 'hoje': return dataAComparar === hojeIso;
            case 'ontem': return dataAComparar === ontemIso;
            case 'semana': return dataAComparar >= semanaIso && dataAComparar <= hojeIso;
            case 'mes': return dataAComparar >= mesIso && dataAComparar <= hojeIso;
            case 'especifico': return dataAComparar === dataEspecifica;
            case 'tudo': return true;
            default: return true;
        }
    };

    let receitas = 0, despesas = 0, glosas = 0, inadimplente = 0, totalFaturado = 0;
    
    clinicaState.financeiro.lancamentos.forEach(l => {
        if (!dataDentroDoFiltro(l.competencia)) return;

        totalFaturado += l.valor; 
        
        if (l.status === 'Recebido/Pago') {
            if (l.tipo === 'Receita') receitas += l.valor;
            else despesas += l.valor;
        } else if (l.status === 'Glosa') {
            glosas += l.valor;
        } else if (l.status === 'Inadimplente') {
            inadimplente += l.valor;
        }
    });
    
    const lucro = receitas - despesas;
    
    const tituloDRE = document.getElementById('dash-titulo-financeiro');
    const nomesFiltros = {
        'hoje': 'Apenas Hoje', 'ontem': 'Ontem', 'semana': 'Últimos 7 Dias', 
        'mes': 'Últimos 30 Dias', 'tudo': 'Todo o Histórico', 'especifico': 'Data Específica'
    };
    if (tituloDRE) tituloDRE.innerHTML = `Performance Financeira (${nomesFiltros[filtroPeriodo]})`;

    const dashRec = document.getElementById('dash-receitas');
    const dashDesp = document.getElementById('dash-despesas');
    const dashGlosas = document.getElementById('dash-glosas');
    const dashLucro = document.getElementById('dash-lucro');
    
    if(dashRec) dashRec.textContent = formatCurrency(receitas);
    if(dashDesp) dashDesp.textContent = formatCurrency(despesas);
    if(dashGlosas) dashGlosas.textContent = formatCurrency(glosas);
    if(dashLucro) {
        dashLucro.textContent = formatCurrency(lucro);
        dashLucro.style.color = lucro < 0 ? '#dc3545' : 'var(--primary-color)';
    }

    const txInad = totalFaturado > 0 ? ((inadimplente / totalFaturado) * 100).toFixed(1) : 0;
    const txGlosa = totalFaturado > 0 ? ((glosas / totalFaturado) * 100).toFixed(1) : 0;

    const elTxInad = document.getElementById('dash-tx-inad');
    const elBarInad = document.getElementById('dash-bar-inad');
    if (elTxInad) elTxInad.textContent = `${txInad}%`;
    if (elBarInad) elBarInad.style.width = `${txInad}%`;

    const elTxGlosa = document.getElementById('dash-tx-glosa');
    const elBarGlosa = document.getElementById('dash-bar-glosa');
    if (elTxGlosa) elTxGlosa.textContent = `${txGlosa}%`;
    if (elBarGlosa) elBarGlosa.style.width = `${txGlosa}%`;

    const dashAgenda = document.getElementById('dash-list-agenda');
    const dashAgendaTitulo = document.getElementById('dash-titulo-agenda');
    
    if (dashAgenda) {
        const consultasFiltradas = clinicaState.agenda.agendamentos.filter(a => dataDentroDoFiltro(a.data));
        
        if (dashAgendaTitulo) dashAgendaTitulo.innerHTML = `<i class="fa-solid fa-calendar-check" style="color: var(--primary-light);"></i> Consultas (${nomesFiltros[filtroPeriodo]})`;

        if (consultasFiltradas.length === 0) {
            dashAgenda.innerHTML = '<p style="color: var(--text-light); font-size: 0.9rem; text-align: center; padding: 20px;">Nenhuma consulta neste período.</p>';
        } else {
            consultasFiltradas.sort((a,b) => (a.data + a.hora).localeCompare(b.data + b.hora));

            dashAgenda.innerHTML = consultasFiltradas.map(c => {
                let badgeColor = c.status === 'aguardando' ? 'warning' : (c.status === 'em-atendimento' ? 'success' : 'neutral');
                let dataExibicao = (filtroPeriodo === 'hoje' || filtroPeriodo === 'ontem' || filtroPeriodo === 'especifico')
                                 ? c.hora
                                 : `${c.data.split('-').reverse().join('/').slice(0,5)} às ${c.hora}`; 

                return `
                <div class="dash-list-item">
                    <div>
                        <strong style="color: var(--primary-color);">${dataExibicao}</strong> - <strong>${c.pacNome}</strong><br>
                        <span style="color: var(--text-light); font-size: 0.75rem;"><i class="fa-solid fa-stethoscope"></i> ${c.tipo || 'Consulta'}</span>
                    </div>
                    <span class="badge ${badgeColor}" style="font-size:0.7rem; text-transform: uppercase;">${c.status}</span>
                </div>
            `}).join('');
        }
    }

    const dashEstoque = document.getElementById('dash-list-estoque');
    if (dashEstoque) {
        const itensAlerta = clinicaState.estoque.filter(i => i.qtd <= i.min);
        if (itensAlerta.length === 0) {
            dashEstoque.innerHTML = '<p style="color: var(--text-light); font-size: 0.9rem; text-align: center; padding: 20px;">Estoque saudável. Nenhum alerta hoje.</p>';
        } else {
            dashEstoque.innerHTML = itensAlerta.map(i => `
                <div class="dash-list-item danger">
                    <div>
                        <strong>${i.nome}</strong><br>
                        <span style="color: var(--text-light); font-size: 0.75rem;"><i class="fa-solid fa-barcode"></i> Lote: ${i.lote}</span>
                    </div>
                    <div style="text-align: right;">
                        <strong style="color: #dc3545; font-size: 1rem;">${i.qtd} un</strong><br>
                        <span style="font-size: 0.7rem; color: var(--text-light);">Mínimo: ${i.min}</span>
                    </div>
                </div>
            `).join('');
        }
    }
}

// ========================================================
// NOVA TABELA FINANCEIRA RESTRUTURADA
// ========================================================
export function atualizarTabelaFinanceiro(filtroTexto = '', filtroMes = 'todos') {
    let totalReceitas = 0;
    let totalDespesas = 0;

    // Filtra os lançamentos pela barra de pesquisa e pelo dropdown de meses
    const filtrados = clinicaState.financeiro.lancamentos.filter(l => {
        const matchTexto = l.vinculo.toLowerCase().includes(filtroTexto) ||
                           l.tipo.toLowerCase().includes(filtroTexto) ||
                           l.pagamento.toLowerCase().includes(filtroTexto);

        let matchMes = true;
        if (filtroMes !== 'todos' && l.competencia) {
            const mesAnoLancamento = l.competencia.substring(0, 7); 
            matchMes = (mesAnoLancamento === filtroMes);
        }

        return matchTexto && matchMes;
    });

    // Renderiza a Tabela Agrupada
    document.getElementById('finance-table-body').innerHTML = filtrados.slice().reverse().map(l => {
        const isEntrada = l.tipo === 'Receita';

        if (l.status === 'Recebido/Pago') {
            if (isEntrada) totalReceitas += l.valor;
            else totalDespesas += l.valor;
        }

        // Ícones inteligentes baseados na forma de pagamento
        let iconPag = 'fa-money-bill';
        if(l.pagamento === 'Pix') iconPag = 'fa-brands fa-pix';
        else if(l.pagamento.includes('Credito') || l.pagamento.includes('Debito')) iconPag = 'fa-credit-card';
        else if(l.pagamento === 'Boleto') iconPag = 'fa-barcode';
        
        let corStatus = l.status === 'Recebido/Pago' ? 'success' : (l.status === 'Glosa' || l.status === 'Inadimplente' ? 'danger bg-danger' : 'warning');

        return `<tr>
            <td>
                <span style="font-weight: 600;">${l.competencia.split('-').reverse().join('/')}</span><br>
                <small style="color: var(--text-light);"><i class="fa-solid fa-cash-register"></i> Caixa: ${l.caixa.split('-').reverse().join('/')}</small>
            </td>
            <td>
                <strong>${l.vinculo}</strong><br>
                <small style="color: var(--text-light);">${l.tipo}</small>
            </td>
            <td><i class="fa-solid ${iconPag} icon-primary"></i> ${l.pagamento}</td>
            <td><span class="badge ${corStatus}">${l.status}</span></td>
            <td class="${isEntrada ? 'positivo' : 'negativo'} valor-lancamento">
                ${isEntrada ? '+' : '-'} ${formatCurrency(l.valor)}
            </td>
            <td>
                <div class="row-actions">
                    <button class="btn-action btn-edit btn-editar-fin" data-id="${l.id}" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-action btn-delete btn-excluir-fin" data-id="${l.id}" title="Excluir">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    // Atualiza o Mini-Dashboard Local (abaixo do título)
    const elRec = document.getElementById('fin-stat-receitas');
    const elDesp = document.getElementById('fin-stat-despesas');
    const elSaldo = document.getElementById('fin-stat-saldo');

    if(elRec) elRec.textContent = formatCurrency(totalReceitas);
    if(elDesp) elDesp.textContent = formatCurrency(totalDespesas);
    if(elSaldo) {
        const saldo = totalReceitas - totalDespesas;
        elSaldo.textContent = formatCurrency(saldo);
        elSaldo.style.color = saldo < 0 ? '#dc3545' : 'var(--primary-color)';
    }
}

export async function carregarFinanceiro() {
    try {
        const q = query(
            collection(db, "financeiro"), 
            where("clinicaId", "==", clinicaState.sessao.clinicaId)
        );
        const querySnapshot = await getDocs(q);
        
        clinicaState.financeiro.lancamentos = [];
                  
        querySnapshot.forEach((doc) => {
            clinicaState.financeiro.lancamentos.push({
                ...doc.data(),
                id: String(doc.id)
            });
        });

        // Alimenta automaticamente o seletor de meses com as datas que existem no banco!
        const mesSelect = document.getElementById('filtro-mes-financeiro');
        if (mesSelect) {
            const mesesUnicos = [...new Set(clinicaState.financeiro.lancamentos.map(l => l.competencia.substring(0, 7)))].sort().reverse();
            const valorAtual = mesSelect.value; 
            
            mesSelect.innerHTML = '<option value="todos">Todos os Meses</option>' +
                mesesUnicos.map(m => {
                    const [ano, mes] = m.split('-');
                    return `<option value="${m}">${mes}/${ano}</option>`;
                }).join('');
                
            // Mantém o filtro aplicado, se ainda existir na lista nova
            if ([...mesSelect.options].some(o => o.value === valorAtual)) {
                mesSelect.value = valorAtual;
            }
        }
        
        // Renderiza tudo e atualiza os dashboards
        const barraPesquisa = document.getElementById('search-financeiro');
        const searchTexto = barraPesquisa ? barraPesquisa.value.toLowerCase() : '';
        
        atualizarTabelaFinanceiro(searchTexto, mesSelect ? mesSelect.value : 'todos');
        calcularDRE(); 
             
    } catch (error) {
        console.error("Erro ao buscar dados financeiros: ", error);
        showToast('Erro ao carregar o livro caixa.', 'error');
    }
}