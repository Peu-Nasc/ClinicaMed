import { clinicaState } from './state.js';
import { formatCurrency, showToast } from './Ferramentas.js';

export function initFinanceiro() {
    const modalFinanceiro = document.getElementById('modal-financeiro');
    
    document.getElementById('btn-abrir-modal-financeiro').addEventListener('click', () => {
        const hoje = new Date().toISOString().split('T')[0];
        document.getElementById('fin-competencia').value = hoje;
        document.getElementById('fin-caixa').value = hoje;
        modalFinanceiro.classList.add('active');
    });

    document.getElementById('btn-close-financeiro').addEventListener('click', () => modalFinanceiro.classList.remove('active'));

    document.getElementById('form-financeiro').addEventListener('submit', (e) => {
        e.preventDefault();
        
        let valorInput = document.getElementById('fin-valor').value;
        // Se estiver usando a máscara do IMask, removemos os pontos de milhar antes de salvar
        if (typeof valorInput === 'string') {
            valorInput = valorInput.replace(/\./g, '').replace(',', '.');
        }

        clinicaState.financeiro.lancamentos.push({
            id: Date.now(),
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
        atualizarTabelaFinanceiro();
        calcularDRE();
        showToast('Lançamento financeiro salvo.');
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