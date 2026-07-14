import { clinicaState } from './state.js';
import { showToast } from './Ferramentas.js';

import { db, collection, addDoc, getDocs } from './firebase.js';

export function initEstoque() {
    const modalEstoque = document.getElementById('modal-estoque');
    
    document.getElementById('btn-abrir-modal-estoque').addEventListener('click', () => modalEstoque.classList.add('active'));
    document.getElementById('btn-close-estoque').addEventListener('click', () => modalEstoque.classList.remove('active'));
    
    document.getElementById('form-estoque').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btnSalvar = e.target.querySelector('button[type="submit"]');
        const textoOriginal = btnSalvar.innerHTML;
        btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registrando...';
        btnSalvar.disabled = true;

        try {
            await addDoc(collection(db, "estoque"), {
                codigo: document.getElementById('est-codigo').value,
                nome: document.getElementById('est-nome').value,
                apresentacao: document.getElementById('est-apresentacao').value,
                anvisa: document.getElementById('est-anvisa').value,
                lote: document.getElementById('est-lote').value,
                validade: document.getElementById('est-validade').value,
                qtd: parseInt(document.getElementById('est-qtd').value),
                min: parseInt(document.getElementById('est-min').value),
                controle: document.getElementById('est-controle').value
            });
            
            modalEstoque.classList.remove('active');
            e.target.reset();
            showToast('Item registrado no estoque com sucesso.', 'success');
            
            // Recarrega os dados do Firebase para atualizar a tabela
            await carregarEstoque(); 
            
        } catch (error) {
            console.error("Erro no estoque: ", error);
            showToast('Falha ao registrar item.', 'error');
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    });
}

export function verificarAlertasEstoque() {
    const hoje = new Date();
    clinicaState.estoque.forEach(item => {
        if (item.qtd <= item.min) showToast(`Alerta: ${item.nome} atingiu o estoque mínimo!`, 'warning');
        
        const diasVenc = Math.floor((new Date(item.validade) - hoje) / (1000 * 60 * 60 * 24));
        if (diasVenc <= 30 && diasVenc >= 0) showToast(`Lote ${item.lote} de ${item.nome} vence em ${diasVenc} dias!`, 'error');
        else if (diasVenc < 0) showToast(`Item Vencido: Lote ${item.lote} de ${item.nome}!`, 'error');
    });
}

export function atualizarTabelaEstoque() {
    document.getElementById('stock-table-body').innerHTML = clinicaState.estoque.map(i => {
        const isVencido = new Date(i.validade) < new Date();
        const badgeClass = i.qtd <= i.min || isVencido ? 'warning' : 'success';
        return `<tr>
            <td>${i.codigo}</td>
            <td><strong>${i.nome}</strong><br><small>${i.apresentacao} | ${i.controle}</small></td>
            <td>L: ${i.lote}<br><small>Val: ${i.validade}</small></td>
            <td><span class="badge ${badgeClass}">${i.qtd} un</span></td>
            <td><button class="btn-action">Baixar Cód.Barras</button></td>
        </tr>`;
    }).join('');
}

export async function carregarEstoque() {
    try {
        const querySnapshot = await getDocs(collection(db, "estoque"));
        clinicaState.estoque = []; 
        
        querySnapshot.forEach((doc) => {
            clinicaState.estoque.push({
                ...doc.data(),
                id: String(doc.id)
            });
        });
        
        atualizarTabelaEstoque();
        verificarAlertasEstoque(); // Dispara os avisos de validade e quantidade mínima
        
    } catch (error) {
        console.error("Erro ao buscar dados do estoque: ", error);
        showToast('Erro ao carregar o inventário.', 'error');
    }
}