import { clinicaState } from './state.js';
import { formatCurrency, showToast, renderCardGrid, comEstadoDeCarregamento, escapeHTML, confirmarAcao } from './Ferramentas.js';
import { db, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from './firebase.js';

let lancamentoEmEdicaoId = null;
let dreChartInstance = null;
let custoFixoEmEdicaoId = null;

const CATEGORIAS_CUSTO_FIXO = {
    'Aluguel': 'Aluguel',
    'Salarios': 'Salários',
    'Contas': 'Água / Luz / Internet',
    'Insumos': 'Insumos Recorrentes',
    'Manutencao': 'Manutenção',
    'Outros': 'Outros'
};

export function initFinanceiro() {
    // Monta os cards dos dois mini-dashboards controlados por este módulo
    // (Performance Financeira do Dashboard principal + Livro Caixa)
    renderCardGrid('dash-mini-dash', [
        { id: 'dash-receitas', label: 'Receitas Liquidadas', initial: 'R$ 0,00', variant: 'success', valueClass: 'positivo' },
        { id: 'dash-despesas', label: 'Despesas / Custos', initial: 'R$ 0,00', variant: 'danger', valueClass: 'negativo' },
        { id: 'dash-glosas', label: 'Glosas Médicas', initial: 'R$ 0,00', variant: 'warning', valueClass: 'warning' },
        { id: 'dash-lucro', label: 'Lucro Líquido (DRE)', initial: 'R$ 0,00', variant: 'primary', valueClass: 'total' }
    ]);

    renderCardGrid('fin-mini-dash', [
        { id: 'fin-stat-receitas', label: 'Entradas (Receitas)', initial: 'R$ 0,00', variant: 'success', valueClass: 'positivo', compact: true },
        { id: 'fin-stat-despesas', label: 'Saídas (Despesas)', initial: 'R$ 0,00', variant: 'danger', valueClass: 'negativo', compact: true },
        { id: 'fin-stat-saldo', label: 'Saldo do Filtro Atual', initial: 'R$ 0,00', variant: 'primary', valueClass: 'total', compact: true }
    ]);

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

    const btnExportarCSV = document.getElementById('btn-exportar-financeiro');
    if (btnExportarCSV) {
        btnExportarCSV.addEventListener('click', exportarFinanceiroCSV);
    }

    // ========================================================
    // FORMULÁRIO DE LANÇAMENTOS
    // ========================================================
    document.getElementById('form-financeiro').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btnSalvar = e.target.querySelector('button[type="submit"]');

        await comEstadoDeCarregamento(btnSalvar, 'Lançando...', async () => {
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
            }
        });
    });

    const financeTableBody = document.getElementById('finance-table-body');
    if (financeTableBody) {
        financeTableBody.addEventListener('click', async (e) => {
            const btnEditar = e.target.closest('.btn-editar-fin');
            const btnExcluir = e.target.closest('.btn-excluir-fin');

            if (btnExcluir) {
                const idFin = btnExcluir.getAttribute('data-id');
                if (await confirmarAcao('Deseja realmente excluir este lançamento financeiro? Essa ação recalculará a sua DRE imediatamente.', { titulo: 'Excluir lançamento', textoConfirmar: 'Excluir' })) {
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

    initCustosFixos();
}

// ========================================================
// CUSTOS FIXOS (aluguel, salários, insumos recorrentes)
// ========================================================
function initCustosFixos() {
    renderCardGrid('custo-fixo-mini-dash', [
        { id: 'custo-fixo-stat-total', label: 'Total Mensal Fixo', initial: 'R$ 0,00', variant: 'danger', valueClass: 'negativo' },
        { id: 'custo-fixo-stat-qtd', label: 'Custos Cadastrados', initial: '0', variant: 'primary' }
    ]);

    const modalCustoFixo = document.getElementById('modal-custo-fixo');

    document.getElementById('btn-abrir-modal-custo-fixo').addEventListener('click', () => {
        modalCustoFixo.classList.add('active');
    });

    document.getElementById('btn-close-custo-fixo').addEventListener('click', () => {
        modalCustoFixo.classList.remove('active');
        custoFixoEmEdicaoId = null;
        document.getElementById('form-custo-fixo').reset();
    });

    document.getElementById('form-custo-fixo').addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnSalvar = e.target.querySelector('button[type="submit"]');

        await comEstadoDeCarregamento(btnSalvar, 'Salvando...', async () => {
            let valorInput = document.getElementById('custo-valor').value;
            if (typeof valorInput === 'string') {
                valorInput = valorInput.replace(/\./g, '').replace(',', '.');
            }

            try {
                const dadosParaSalvar = {
                    descricao: document.getElementById('custo-descricao').value,
                    categoria: document.getElementById('custo-categoria').value,
                    diaVencimento: parseInt(document.getElementById('custo-dia-vencimento').value),
                    valor: parseFloat(valorInput),
                    clinicaId: clinicaState.sessao.clinicaId
                };

                if (custoFixoEmEdicaoId) {
                    await updateDoc(doc(db, "custosFixos", custoFixoEmEdicaoId), dadosParaSalvar);
                    showToast('Custo fixo atualizado com sucesso.', 'success');
                } else {
                    await addDoc(collection(db, "custosFixos"), dadosParaSalvar);
                    showToast('Custo fixo cadastrado com sucesso.', 'success');
                }

                modalCustoFixo.classList.remove('active');
                e.target.reset();
                custoFixoEmEdicaoId = null;

                await carregarCustosFixos();

            } catch (error) {
                console.error("Erro nos custos fixos: ", error);
                showToast('Falha ao registrar custo fixo.', 'error');
            }
        });
    });

    const custoFixoTableBody = document.getElementById('custo-fixo-table-body');
    if (custoFixoTableBody) {
        custoFixoTableBody.addEventListener('click', async (e) => {
            const btnEditar = e.target.closest('.btn-editar-custo-fixo');
            const btnExcluir = e.target.closest('.btn-excluir-custo-fixo');

            if (btnExcluir) {
                const idCusto = btnExcluir.getAttribute('data-id');
                if (await confirmarAcao('Deseja realmente excluir este custo fixo?', { titulo: 'Excluir custo fixo', textoConfirmar: 'Excluir' })) {
                    try {
                        await deleteDoc(doc(db, "custosFixos", idCusto));
                        showToast('Custo fixo excluído com sucesso.', 'success');
                        await carregarCustosFixos();
                    } catch (error) {
                        console.error("Erro ao excluir custo fixo: ", error);
                        showToast('Falha ao excluir custo fixo.', 'error');
                    }
                }
            }

            if (btnEditar) {
                const idCusto = btnEditar.getAttribute('data-id');
                const custo = clinicaState.financeiro.custosFixos.find(c => String(c.id) === String(idCusto));

                if (custo) {
                    custoFixoEmEdicaoId = custo.id;

                    document.getElementById('custo-descricao').value = custo.descricao;
                    document.getElementById('custo-categoria').value = custo.categoria;
                    document.getElementById('custo-dia-vencimento').value = custo.diaVencimento;
                    document.getElementById('custo-valor').value = custo.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

                    modalCustoFixo.classList.add('active');
                }
            }
        });
    }
}

export function atualizarTabelaCustosFixos() {
    const corpoTabela = document.getElementById('custo-fixo-table-body');
    if (!corpoTabela) return;

    const custos = clinicaState.financeiro.custosFixos.slice().sort((a, b) => a.diaVencimento - b.diaVencimento);
    let totalMensal = 0;

    corpoTabela.innerHTML = custos.map(c => {
        totalMensal += c.valor;

        return `<tr>
            <td><strong>${escapeHTML(c.descricao)}</strong></td>
            <td><span class="badge info">${escapeHTML(CATEGORIAS_CUSTO_FIXO[c.categoria] || c.categoria)}</span></td>
            <td>Todo dia ${c.diaVencimento}</td>
            <td class="negativo valor-lancamento">${formatCurrency(c.valor)}</td>
            <td>
                <div class="row-actions">
                    <button class="btn-action btn-edit btn-editar-custo-fixo" data-id="${c.id}" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-action btn-delete btn-excluir-custo-fixo" data-id="${c.id}" title="Excluir">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    const elTotal = document.getElementById('custo-fixo-stat-total');
    const elQtd = document.getElementById('custo-fixo-stat-qtd');

    if (elTotal) elTotal.textContent = formatCurrency(totalMensal);
    if (elQtd) elQtd.textContent = custos.length;
}

export async function carregarCustosFixos() {
    try {
        const q = query(
            collection(db, "custosFixos"),
            where("clinicaId", "==", clinicaState.sessao.clinicaId)
        );
        const querySnapshot = await getDocs(q);

        clinicaState.financeiro.custosFixos = [];

        querySnapshot.forEach((doc) => {
            clinicaState.financeiro.custosFixos.push({
                ...doc.data(),
                id: String(doc.id)
            });
        });

        atualizarTabelaCustosFixos();

    } catch (error) {
        console.error("Erro ao buscar custos fixos: ", error);
        showToast('Erro ao carregar os custos fixos.', 'error');
    }
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
                const coresPorStatus = {
                    agendado: 'neutral',
                    confirmado: 'primary',
                    aguardando_atendimento: 'warning',
                    concluido: 'success',
                    cancelado: 'danger'
                };
                let badgeColor = coresPorStatus[c.status] || 'neutral';
                let dataExibicao = (filtroPeriodo === 'hoje' || filtroPeriodo === 'ontem' || filtroPeriodo === 'especifico')
                                 ? c.hora
                                 : `${c.data.split('-').reverse().join('/').slice(0,5)} às ${c.hora}`; 

                return `
                <div class="dash-list-item">
                    <div>
                        <strong style="color: var(--primary-color);">${dataExibicao}</strong> - <strong>${escapeHTML(c.pacNome)}</strong><br>
                        <span style="color: var(--text-light); font-size: 0.75rem;"><i class="fa-solid fa-stethoscope"></i> ${escapeHTML(c.tipo || 'Consulta')}</span>
                    </div>
                    <span class="badge ${badgeColor}" style="font-size:0.7rem; text-transform: uppercase;">${escapeHTML(c.status)}</span>
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
                        <strong>${escapeHTML(i.nome)}</strong><br>
                        <span style="color: var(--text-light); font-size: 0.75rem;"><i class="fa-solid fa-barcode"></i> Lote: ${escapeHTML(i.lote)}</span>
                    </div>
                    <div style="text-align: right;">
                        <strong style="color: #dc3545; font-size: 1rem;">${i.qtd} un</strong><br>
                        <span style="font-size: 0.7rem; color: var(--text-light);">Mínimo: ${i.min}</span>
                    </div>
                </div>
            `).join('');
        }
    }

    // Painel "Custos Fixos do Mês" - é uma PREVISÃO (o que está cadastrado
    // em Custos Fixos), não entra na conta de Despesas/Lucro acima, que
    // reflete só o que foi de fato lançado no Livro Caixa.
    const dashCustosFixos = document.getElementById('dash-list-custos-fixos');
    const dashCustosFixosTotal = document.getElementById('dash-custos-fixos-total');
    if (dashCustosFixos) {
        const custos = clinicaState.financeiro.custosFixos.slice().sort((a, b) => a.diaVencimento - b.diaVencimento);

        if (custos.length === 0) {
            dashCustosFixos.innerHTML = '<p style="color: var(--text-light); font-size: 0.9rem; text-align: center; padding: 20px;">Nenhum custo fixo cadastrado.</p>';
        } else {
            dashCustosFixos.innerHTML = custos.map(c => `
                <div class="dash-list-item warning">
                    <div>
                        <strong>${escapeHTML(c.descricao)}</strong><br>
                        <span style="color: var(--text-light); font-size: 0.75rem;"><i class="fa-solid fa-calendar-day"></i> Vence dia ${c.diaVencimento}</span>
                    </div>
                    <strong style="color: var(--text-main); font-size: 0.95rem;">${formatCurrency(c.valor)}</strong>
                </div>
            `).join('');
        }

        if (dashCustosFixosTotal) {
            const totalPrevisto = custos.reduce((soma, c) => soma + c.valor, 0);
            dashCustosFixosTotal.innerHTML = `<span style="color: var(--text-light); font-weight: 600;">Total previsto/mês</span> <span>${formatCurrency(totalPrevisto)}</span>`;
        }
    }

    // Painel "Revisões Pendentes" - pacientes com data de retorno marcada
    // pelo médico na evolução (campo "Retornar em X dias"). Mostra quem já
    // venceu (atrasado) e quem vence nos próximos 7 dias.
    const dashRevisoes = document.getElementById('dash-list-revisoes');
    if (dashRevisoes) {
        const hojeIsoRevisao = getIsoDate(new Date());
        const limiteRevisaoObj = new Date();
        limiteRevisaoObj.setDate(limiteRevisaoObj.getDate() + 7);
        const limiteRevisaoIso = getIsoDate(limiteRevisaoObj);

        const pacientesComRetorno = clinicaState.pacientes
            .filter(p => p.proximoRetorno && p.proximoRetorno <= limiteRevisaoIso)
            .sort((a, b) => a.proximoRetorno.localeCompare(b.proximoRetorno));

        if (pacientesComRetorno.length === 0) {
            dashRevisoes.innerHTML = '<p style="color: var(--text-light); font-size: 0.9rem; text-align: center; padding: 20px;">Nenhuma revisão pendente nos próximos 7 dias.</p>';
        } else {
            dashRevisoes.innerHTML = pacientesComRetorno.map(p => {
                const atrasado = p.proximoRetorno < hojeIsoRevisao;
                const dataExibicao = p.proximoRetorno.split('-').reverse().join('/');
                return `
                <div class="dash-list-item ${atrasado ? 'danger' : 'warning'}">
                    <div>
                        <strong>${escapeHTML(p.nome)}</strong><br>
                        <span style="color: var(--text-light); font-size: 0.75rem;"><i class="fa-solid fa-calendar-day"></i> ${atrasado ? 'Venceu em' : 'Retorno em'} ${dataExibicao}</span>
                    </div>
                    ${atrasado ? '<span class="badge danger bg-danger">Atrasado</span>' : ''}
                </div>`;
            }).join('');
        }
    }

    // ==========================================
    // NOVO: ATUALIZAR O GRÁFICO (Estilo App de Banco)
    // ==========================================
    const ctx = document.getElementById('dreChart');
    if (ctx) {
        if (dreChartInstance) {
            dreChartInstance.destroy();
        }

        // 1. Agrupar os valores líquidos por data
        const historicoPorData = {};
        const lancamentosFiltrados = clinicaState.financeiro.lancamentos.filter(l => dataDentroDoFiltro(l.competencia));
        
        // Ordena por data (da mais antiga para a mais nova)
        lancamentosFiltrados.sort((a, b) => a.competencia.localeCompare(b.competencia));

        lancamentosFiltrados.forEach(l => {
            if (l.status === 'Recebido/Pago') {
                const dataFormatada = l.competencia.split('-').reverse().join('/'); // Formato DD/MM/AAAA
                if (!historicoPorData[dataFormatada]) historicoPorData[dataFormatada] = 0;
                
                if (l.tipo === 'Receita') historicoPorData[dataFormatada] += l.valor;
                else historicoPorData[dataFormatada] -= l.valor;
            }
        });

        // 2. Separar as chaves (Datas) e os valores (Saldos)
        const labelsData = Object.keys(historicoPorData);
        const valoresSaldo = Object.values(historicoPorData);

        // Prevenção: Se não houver dados, insere um valor zerado para o gráfico não sumir
        if (labelsData.length === 0) {
            labelsData.push('Sem Movimentação');
            valoresSaldo.push(0);
        }

        // 3. Criar o Efeito de Gradiente (Sombreado embaixo da linha)
        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(15, 76, 117, 0.4)'); // Azul primário com 40% de opacidade
        gradient.addColorStop(1, 'rgba(15, 76, 117, 0.0)'); // Fica transparente no fundo

        dreChartInstance = new Chart(ctx, {
            type: 'line', // Muda para Linha
            data: {
                labels: labelsData,
                datasets: [{
                    label: 'Saldo Líquido do Dia (R$)',
                    data: valoresSaldo,
                    borderColor: '#0F4C75', // Cor da linha (Azul Primário do CSS)
                    backgroundColor: gradient, // O sombreado Efeito Banco
                    borderWidth: 3,
                    tension: 0.4, // Isso faz a linha ficar curvada e suave (Efeito Onda)
                    fill: true, // Preenche o espaço debaixo da linha
                    pointBackgroundColor: '#0F4C75',
                    pointRadius: 4, // Tamanho da bolinha ao passar o mouse
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return ' R$ ' + context.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false } // Remove as linhas verticais para ficar mais clean
                    },
                    y: {
                        grid: { color: '#E2E8F0' }, // Linhas horizontais bem sutis
                        ticks: {
                            callback: function(value) {
                                return 'R$ ' + value.toLocaleString('pt-BR');
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

}

// Filtra os lançamentos pela barra de pesquisa e pelo dropdown de meses
// (usado tanto pela tabela quanto pela exportação em CSV, pra manter os dois sempre consistentes)
function filtrarLancamentos(filtroTexto = '', filtroMes = 'todos') {
    return clinicaState.financeiro.lancamentos.filter(l => {
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
}

// ========================================================
// NOVA TABELA FINANCEIRA RESTRUTURADA
// ========================================================
export function atualizarTabelaFinanceiro(filtroTexto = '', filtroMes = 'todos') {
    let totalReceitas = 0;
    let totalDespesas = 0;

    const filtrados = filtrarLancamentos(filtroTexto, filtroMes);

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
                <strong>${escapeHTML(l.vinculo)}</strong><br>
                <small style="color: var(--text-light);">${escapeHTML(l.tipo)}</small>
            </td>
            <td><i class="fa-solid ${iconPag} icon-primary"></i> ${escapeHTML(l.pagamento)}</td>
            <td><span class="badge ${corStatus}">${escapeHTML(l.status)}</span></td>
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

// ========================================================
// EXPORTAÇÃO DO LIVRO CAIXA EM CSV (respeita o filtro atual da tela)
// ========================================================
export function exportarFinanceiroCSV() {
    const searchFin = document.getElementById('search-financeiro');
    const mesFin = document.getElementById('filtro-mes-financeiro');
    const filtroTexto = searchFin ? searchFin.value.toLowerCase() : '';
    const filtroMes = mesFin ? mesFin.value : 'todos';

    const lancamentos = filtrarLancamentos(filtroTexto, filtroMes).slice().reverse();

    if (lancamentos.length === 0) {
        showToast('Nenhum lançamento para exportar com o filtro atual.', 'warning');
        return;
    }

    const cabecalho = ['Competência', 'Data de Caixa', 'Tipo', 'Vínculo', 'Forma de Pagamento', 'Status', 'Valor (R$)'];
    const linhas = lancamentos.map(l => [
        l.competencia.split('-').reverse().join('/'),
        l.caixa.split('-').reverse().join('/'),
        l.tipo,
        l.vinculo,
        l.pagamento,
        l.status,
        l.valor.toFixed(2).replace('.', ',')
    ]);

    // Ponto e vírgula como separador (padrão que o Excel em pt-BR reconhece automaticamente)
    const csv = [cabecalho, ...linhas]
        .map(linha => linha.map(campo => `"${String(campo).replace(/"/g, '""')}"`).join(';'))
        .join('\r\n');

    // BOM no início garante que acentuação (UTF-8) apareça corretamente no Excel
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dataAtual = new Date().toISOString().split('T')[0];

    link.href = url;
    link.download = `livro-caixa_${dataAtual}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`${lancamentos.length} lançamento(s) exportado(s) com sucesso.`, 'success');
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