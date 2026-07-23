// Dropdown (Menus Suspensos) — combobox custom do Design System
// Mantém um <select> nativo oculto por trás pra não quebrar leituras de .value existentes no resto do código.
function toggleGovDropdown(id) {
    const select = document.getElementById(id);
    if (select && select.disabled) return;
    const trigger = document.getElementById(id + '-trigger');
    const jaAberto = trigger.classList.contains('active');
    document.querySelectorAll('.dropdown-trigger.active').forEach(t => t.classList.remove('active'));
    if (!jaAberto) {
        trigger.classList.add('active');
        trigger.setAttribute('aria-expanded', 'true');
    } else {
        trigger.setAttribute('aria-expanded', 'false');
    }
}

function selecionarGovDropdown(id, valor, rotulo) {
    const select = document.getElementById(id);
    if (select.multiple) {
        if (valor === "") {
            Array.from(select.options).forEach(o => o.selected = false);
            select.options[0].selected = true;
        } else {
            if (select.options.length > 0 && select.options[0].value === "") {
                select.options[0].selected = false;
            }
            const opt = Array.from(select.options).find(o => o.value === valor);
            if (opt) opt.selected = !opt.selected;
            if (select.selectedOptions.length === 0 && select.options.length > 0) {
                select.options[0].selected = true;
            }
        }
        select.dispatchEvent(new Event('change'));
        sincronizarGovDropdown(id);
        return;
    }
    select.value = valor;
    select.dispatchEvent(new Event('change'));
    const label = document.getElementById(id + '-label');
    label.textContent = rotulo;
    label.classList.remove('placeholder');
    document.querySelectorAll('#' + id + '-surface .dropdown-item').forEach(it => {
        it.classList.toggle('active', it.dataset.valor === valor);
    });
    const trigger = document.getElementById(id + '-trigger');
    trigger.classList.remove('active');
    trigger.setAttribute('aria-expanded', 'false');
}

function resetarGovDropdown(id) {
    const label = document.getElementById(id + '-label');
    label.textContent = 'Selecione...';
    label.classList.add('placeholder');
    document.querySelectorAll('#' + id + '-surface .dropdown-item').forEach(it => it.classList.remove('active'));
}

function sincronizarGovDropdown(id) {
    const select = document.getElementById(id);
    const label = document.getElementById(id + '-label');
    if (!select || !label) return;

    if (select.multiple) {
        const selectedOpts = Array.from(select.selectedOptions).filter(o => o.value !== "");
        document.querySelectorAll('#' + id + '-surface .dropdown-item').forEach(it => {
            const isSelected = selectedOpts.some(o => o.value === it.dataset.valor) || (selectedOpts.length === 0 && it.dataset.valor === "");
            it.classList.toggle('active', isSelected);
        });
        if (selectedOpts.length === 0) {
            label.textContent = select.options.length ? select.options[0].textContent : 'Todos';
            label.classList.add('placeholder');
        } else if (selectedOpts.length === 1) {
            label.textContent = selectedOpts[0].textContent;
            label.classList.remove('placeholder');
        } else {
            label.textContent = selectedOpts.length + ' selecionados';
            label.classList.remove('placeholder');
        }
        return;
    }

    const opt = select.selectedOptions[0];
    const ehPlaceholder = !opt || opt.disabled;
    document.querySelectorAll('#' + id + '-surface .dropdown-item').forEach(it => {
        it.classList.toggle('active', !ehPlaceholder && it.dataset.valor === select.value);
    });
    if (ehPlaceholder) {
        label.textContent = opt ? opt.textContent : (select.options.length ? select.options[0].textContent : 'Selecione...');
        label.classList.add('placeholder');
    } else {
        label.textContent = opt.textContent;
        label.classList.remove('placeholder');
    }
}

function criarGovDropdown(selectId, compacto) {
    const select = document.getElementById(selectId);
    if (!select || select.dataset.govDropdown) return;
    select.dataset.govDropdown = '1';
    
    const container = document.createElement('div');
    container.className = 'dropdown-demo-container' + (compacto ? ' dropdown-compacto' : '');
    
    if (select.style.marginBottom) {
        container.style.marginBottom = select.style.marginBottom;
        select.style.marginBottom = '';
    }
    select.parentNode.insertBefore(container, select);
    
    const trigger = document.createElement('div');
    trigger.className = 'dropdown-trigger';
    trigger.id = selectId + '-trigger';
    trigger.tabIndex = 0;
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.onclick = function () { toggleGovDropdown(selectId); };
    trigger.onkeydown = function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGovDropdown(selectId); }
    };
    
    const label = document.createElement('span');
    label.id = selectId + '-label';
    trigger.appendChild(label);
    
    const icone = document.createElement('i');
    icone.className = 'fas fa-chevron-down';
    icone.setAttribute('aria-hidden', 'true');
    trigger.appendChild(icone);
    
    const surface = document.createElement('div');
    surface.className = 'dropdown-surface';
    surface.id = selectId + '-surface';
    surface.setAttribute('role', 'listbox');
    
    container.appendChild(trigger);
    container.appendChild(surface);
    container.appendChild(select);
    select.style.display = 'none';
    
    reconstruirGovDropdown(selectId);
}

function reconstruirGovDropdown(selectId) {
    const select = document.getElementById(selectId);
    const surface = document.getElementById(selectId + '-surface');
    if (!select || !surface) return;
    surface.innerHTML = '';
    Array.from(select.options).forEach(op => {
        if (op.disabled) return;
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.setAttribute('role', 'option');
        item.dataset.valor = op.value;
        item.textContent = op.textContent;
        item.onclick = function () { selecionarGovDropdown(selectId, op.value, op.textContent); };
        surface.appendChild(item);
    });
    sincronizarGovDropdown(selectId);
}

document.addEventListener('DOMContentLoaded', function () {
    // Busca todos os selects com classe gov-select e aplica o dropdown custom
    document.querySelectorAll('select.gov-select').forEach(select => {
        if (select.id) {
            criarGovDropdown(select.id, false);
        }
    });
});

document.addEventListener('click', function (e) {
    if (!e.target.closest('.dropdown-demo-container')) {
        document.querySelectorAll('.dropdown-trigger.active').forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-expanded', 'false');
        });
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.dropdown-trigger.active').forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-expanded', 'false');
        });
    }
});
