import { clinicaState } from './state.js';
import { formatCurrency, showToast } from './Ferramentas.js';

import { db, collection, addDoc, getDocs } from './firebase.js';

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
            await addDoc(collection(db, "financeiro"), {
                tipo: document.getElementById('fin-tipo').value,
                vinculo: document.getElementById('fin-vinculo').value,
                pagamento: document.getElementById('fin-pagamento').value,
                status: document.getElementById('fin-status').value,
                competencia: document.getElementById('fin-competencia').value,
                caixa: document.getElementById('fin-caixa').value,
                valor: parseFloat(valorInput)
            });
            
            modalFinanceiro.classList.remove('active');
            e.target.reset();
            showToast('Lançamento registrado na nuvem com sucesso.', 'success');
            
            // Recarrega os dados do Firebase para atualizar a tabela e a DRE
            await carregarFinanceiro(); 
            
        } catch (error) {
            console.error("Erro no caixa: ", error);
            showToast('Falha ao registrar lançamento financeiro.', 'error');
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
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
        </tr>`;
    }).join('');
}

export async function carregarFinanceiro() {
    try {
        const querySnapshot = await getDocs(collection(db, "financeiro"));
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