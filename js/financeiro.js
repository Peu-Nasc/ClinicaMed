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

    document.getElementById('form-financeiro').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btnSalvar = e.target.querySelector('button[type="submit"]');
        const textoOriginal = btnSalvar.innerHTML;
        btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Lançando...';
        btnSalvar.disabled = true;
        
        let valorInput = document.getElementById('fin-valor').value;
        // Tratamento da máscara para converter de volta para número puro
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
                // Modo Edição
                await updateDoc(doc(db, "financeiro", lancamentoEmEdicaoId), dadosParaSalvar);
                showToast('Lançamento atualizado e DRE recalculada!', 'success');
            } else {
                // Modo Novo Cadastro
                await addDoc(collection(db, "financeiro"), dadosParaSalvar);
                showToast('Lançamento registrado na nuvem com sucesso.', 'success');
            }

            modalFinanceiro.classList.remove('active');
            e.target.reset();
            lancamentoEmEdicaoId = null; // Desliga a chave
            
            await carregarFinanceiro(); 
            
        } catch (error) {
            console.error("Erro no caixa: ", error);
            showToast('Falha ao registrar lançamento financeiro.', 'error');
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    });

    // === DELEGAÇÃO DE EVENTOS: EDITAR E EXCLUIR NO CAIXA ===
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
                    lancamentoEmEdicaoId = lancamento.id; // Liga a chave de edição
                    
                    document.getElementById('fin-tipo').value = lancamento.tipo;
                    document.getElementById('fin-vinculo').value = lancamento.vinculo;
                    document.getElementById('fin-pagamento').value = lancamento.pagamento;
                    document.getElementById('fin-status').value = lancamento.status;
                    document.getElementById('fin-competencia').value = lancamento.competencia;
                    document.getElementById('fin-caixa').value = lancamento.caixa;
                    
                    // Converte o valor puro (ex: 1500.5) de volta para o padrão visual do Brasil (ex: 1.500,50) para a máscara não bugar
                    document.getElementById('fin-valor').value = lancamento.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    
                    document.getElementById('modal-financeiro').classList.add('active');
                }
            }
        });
    }

    // Garante que a chave desliga se cancelar a ação no meio
    document.getElementById('btn-close-financeiro').addEventListener('click', () => {
        document.getElementById('modal-financeiro').classList.remove('active');
        lancamentoEmEdicaoId = null; 
        document.getElementById('form-financeiro').reset();
    });
}

export function calcularDRE() {
    let receitas = 0, despesas = 0, glosas = 0;
    
    clinicaState.financeiro.lancamentos.forEach(l => {
        if (l.status === 'Recebido/Pago') {
            if (l.tipo === 'Receita') receitas += l.valor;
            else despesas += l.valor;
        } else if (l.status === 'Glosa') {
            glosas += l.valor;
        }
    });
    
    const lucro = receitas - despesas;
    
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
}

export function atualizarTabelaFinanceiro() {
    document.getElementById('finance-table-body').innerHTML = clinicaState.financeiro.lancamentos.slice().reverse().map(l => {
        const isEntrada = l.tipo === 'Receita';
        return `<tr>
            <td>${l.competencia}</td>
            <td>${l.caixa}</td>
            <td><strong>${l.tipo}</strong></td>
            <td>${l.vinculo}</td>
            <td>${l.pagamento}</td>
            <td><span class="badge ${l.status === 'Recebido/Pago' ? 'success' : 'warning'}">${l.status}</span></td>
            <td class="${isEntrada ? 'positivo' : 'negativo'}">${isEntrada ? '+' : '-'} ${formatCurrency(l.valor)}</td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-action btn-editar-fin" data-id="${l.id}" style="color: var(--primary-light); border-color: var(--primary-light);" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-action btn-excluir-fin" data-id="${l.id}" style="color: #dc3545; border-color: #dc3545;" title="Excluir">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

export async function carregarFinanceiro() {
    try {
        // Busca apenas os lançamentos financeiros da clínica do usuário logado
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
        
        atualizarTabelaFinanceiro();
        calcularDRE(); // Atualiza os painéis da Dashboard Analítica!
             
    } catch (error) {
        console.error("Erro ao buscar dados financeiros: ", error);
        showToast('Erro ao carregar o livro caixa.', 'error');
    }
}