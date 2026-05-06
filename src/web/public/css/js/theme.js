// ============================================================
// RESISTANCE CITY v5.0.0 — Theme Manager
// Управление темами, анимациями, UI-компонентами
// ============================================================

'use strict';

(function() {
    // ==================== УПРАВЛЕНИЕ ТЕМАМИ ====================
    
    const ThemeManager = {
        THEME_KEY: 'resistance_theme',
        themes: ['dark', 'light', 'oled'],
        defaultTheme: 'dark',
        
        init() {
            const savedTheme = localStorage.getItem(this.THEME_KEY) || this.defaultTheme;
            this.applyTheme(savedTheme);
            this.setupToggle();
            this.setupSystemThemeListener();
        },
        
        applyTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem(this.THEME_KEY, theme);
            
            // Обновление мета-тега color-scheme
            const meta = document.querySelector('meta[name="color-scheme"]');
            if (meta) {
                meta.content = theme === 'light' ? 'light' : 'dark';
            } else {
                const newMeta = document.createElement('meta');
                newMeta.name = 'color-scheme';
                newMeta.content = theme === 'light' ? 'light' : 'dark';
                document.head.appendChild(newMeta);
            }
            
            // Обновление all элементов с data-theme-toggle
            document.querySelectorAll('[data-theme-toggle]').forEach(el => {
                el.textContent = this.getThemeIcon(theme);
            });
            
            // Диспатч события
            window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
        },
        
        getCurrentTheme() {
            return document.documentElement.getAttribute('data-theme') || this.defaultTheme;
        },
        
        toggle() {
            const current = this.getCurrentTheme();
            const currentIndex = this.themes.indexOf(current);
            const nextIndex = (currentIndex + 1) % this.themes.length;
            this.applyTheme(this.themes[nextIndex]);
        },
        
        setTheme(theme) {
            if (this.themes.includes(theme)) {
                this.applyTheme(theme);
            }
        },
        
        getThemeIcon(theme) {
            const icons = {
                'dark': '🌙',
                'light': '☀️',
                'oled': '🖤',
            };
            return icons[theme] || '🌙';
        },
        
        setupToggle() {
            document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.toggle();
                });
            });
        },
        
        setupSystemThemeListener() {
            if (window.matchMedia) {
                const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
                mediaQuery.addEventListener('change', (e) => {
                    if (!localStorage.getItem(this.THEME_KEY)) {
                        this.applyTheme(e.matches ? 'dark' : 'light');
                    }
                });
            }
        },
    };

    // ==================== УПРАВЛЕНИЕ АНИМАЦИЯМИ ====================
    
    const AnimationManager = {
        init() {
            this.setupScrollAnimations();
            this.setupHoverEffects();
            this.setupNumberCounters();
        },
        
        setupScrollAnimations() {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('fade-in');
                        observer.unobserve(entry.target);
                    }
                });
            }, {
                threshold: 0.1,
                rootMargin: '0px 0px -50px 0px',
            });
            
            document.querySelectorAll('.animate-on-scroll').forEach(el => {
                observer.observe(el);
            });
        },
        
        setupHoverEffects() {
            document.querySelectorAll('.card-glow').forEach(card => {
                card.addEventListener('mousemove', (e) => {
                    const rect = card.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;
                    const rotateX = (y - centerY) / centerY * 5;
                    const rotateY = (centerX - x) / centerX * 5;
                    
                    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;
                });
                
                card.addEventListener('mouseleave', () => {
                    card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
                });
            });
        },
        
        setupNumberCounters() {
            document.querySelectorAll('[data-count-to]').forEach(el => {
                const target = parseInt(el.dataset.countTo);
                const duration = parseInt(el.dataset.duration) || 2000;
                const start = 0;
                const startTime = performance.now();
                
                function update(currentTime) {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const easeOut = 1 - Math.pow(1 - progress, 3);
                    const current = Math.floor(start + (target - start) * easeOut);
                    
                    el.textContent = current.toLocaleString();
                    
                    if (progress < 1) {
                        requestAnimationFrame(update);
                    }
                }
                
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            requestAnimationFrame(update);
                            observer.unobserve(el);
                        }
                    });
                });
                
                observer.observe(el);
            });
        },
    };

    // ==================== УПРАВЛЕНИЕ TOAST-УВЕДОМЛЕНИЯМИ ====================
    
    const ToastManager = {
        container: null,
        
        init() {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        },
        
        show(message, type = 'info', duration = 3000) {
            if (!this.container) this.init();
            
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            
            const icons = {
                'success': '✅',
                'warning': '⚠️',
                'error': '❌',
                'info': 'ℹ️',
            };
            
            toast.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <span>${icons[type] || ''}</span>
                    <span>${message}</span>
                </div>
            `;
            
            this.container.appendChild(toast);
            
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                toast.style.transition = 'all 0.3s ease';
                
                setTimeout(() => {
                    toast.remove();
                }, 300);
            }, duration);
        },
        
        success(message, duration) {
            this.show(message, 'success', duration);
        },
        
        warning(message, duration) {
            this.show(message, 'warning', duration);
        },
        
        error(message, duration) {
            this.show(message, 'error', duration);
        },
        
        info(message, duration) {
            this.show(message, 'info', duration);
        },
    };

    // ==================== УПРАВЛЕНИЕ МОДАЛЬНЫМИ ОКНАМИ ====================
    
    const ModalManager = {
        init() {
            this.setupTriggers();
            this.setupClosers();
            this.setupOverlayClicks();
        },
        
        open(modalId) {
            const modal = document.getElementById(modalId);
            if (!modal) return;
            
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Фокус на первом input
            const firstInput = modal.querySelector('input, textarea, select');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        },
        
        close(modalId) {
            const modal = document.getElementById(modalId);
            if (!modal) return;
            
            modal.classList.remove('active');
            document.body.style.overflow = '';
        },
        
        setupTriggers() {
            document.querySelectorAll('[data-modal-open]').forEach(trigger => {
                trigger.addEventListener('click', (e) => {
                    e.preventDefault();
                    const modalId = trigger.dataset.modalOpen;
                    this.open(modalId);
                });
            });
        },
        
        setupClosers() {
            document.querySelectorAll('[data-modal-close]').forEach(closer => {
                closer.addEventListener('click', (e) => {
                    e.preventDefault();
                    const modalId = closer.dataset.modalClose;
                    if (modalId) {
                        this.close(modalId);
                    } else {
                        const modal = closer.closest('.modal');
                        if (modal) this.close(modal.id);
                    }
                });
            });
        },
        
        setupOverlayClicks() {
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal') && e.target.classList.contains('active')) {
                    this.close(e.target.id);
                }
            });
        },
    };

    // ==================== УПРАВЛЕНИЕ ВСПЛЫВАЮЩИМИ ПОДСКАЗКАМИ ====================
    
    const TooltipManager = {
        init() {
            document.querySelectorAll('[data-tooltip]').forEach(el => {
                el.addEventListener('mouseenter', (e) => {
                    this.show(el, el.dataset.tooltip);
                });
                el.addEventListener('mouseleave', () => {
                    this.hide();
                });
            });
        },
        
        show(element, text) {
            this.hide();
            
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = text;
            tooltip.style.position = 'absolute';
            tooltip.style.zIndex = '10000';
            
            document.body.appendChild(tooltip);
            
            const rect = element.getBoundingClientRect();
            tooltip.style.left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + 'px';
            tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + 'px';
            
            this._current = tooltip;
        },
        
        hide() {
            if (this._current) {
                this._current.remove();
                this._current = null;
            }
        },
    };

    // ==================== УПРАВЛЕНИЕ ВКЛАДКАМИ ====================
    
    const TabManager = {
        init() {
            document.querySelectorAll('[data-tab-group]').forEach(group => {
                const groupName = group.dataset.tabGroup;
                const tabs = group.querySelectorAll('[data-tab]');
                const panels = document.querySelectorAll(`[data-tab-panel-group="${groupName}"] [data-tab-panel]`);
                
                tabs.forEach(tab => {
                    tab.addEventListener('click', () => {
                        const tabName = tab.dataset.tab;
                        
                        // Деактивация всех вкладок
                        tabs.forEach(t => t.classList.remove('active'));
                        panels.forEach(p => p.classList.remove('active'));
                        
                        // Активация выбранной
                        tab.classList.add('active');
                        const activePanel = document.querySelector(`[data-tab-panel-group="${groupName}"] [data-tab-panel="${tabName}"]`);
                        if (activePanel) activePanel.classList.add('active');
                    });
                });
            });
        },
    };

    // ==================== УПРАВЛЕНИЕ ПОИСКОМ ====================
    
    const SearchManager = {
        init() {
            document.querySelectorAll('[data-search]').forEach(input => {
                const targetSelector = input.dataset.search;
                const targets = document.querySelectorAll(targetSelector);
                
                input.addEventListener('input', () => {
                    const query = input.value.toLowerCase().trim();
                    
                    targets.forEach(target => {
                        const searchable = target.dataset.searchable || target.textContent;
                        if (query === '' || searchable.toLowerCase().includes(query)) {
                            target.style.display = '';
                        } else {
                            target.style.display = 'none';
                        }
                    });
                });
            });
        },
    };

    // ==================== УПРАВЛЕНИЕ КОПИРОВАНИЕМ ====================
    
    const CopyManager = {
        init() {
            document.querySelectorAll('[data-copy]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const text = btn.dataset.copy;
                    
                    try {
                        await navigator.clipboard.writeText(text);
                        ToastManager.success('Скопировано!');
                    } catch (err) {
                        // Fallback
                        const textarea = document.createElement('textarea');
                        textarea.value = text;
                        textarea.style.position = 'fixed';
                        textarea.style.opacity = '0';
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        textarea.remove();
                        ToastManager.success('Скопировано!');
                    }
                });
            });
        },
    };

    // ==================== УПРАВЛЕНИЕ ПОДТВЕРЖДЕНИЯМИ ====================
    
    const ConfirmManager = {
        init() {
            document.querySelectorAll('[data-confirm]').forEach(el => {
                el.addEventListener('click', function(e) {
                    const message = this.dataset.confirm || 'Вы уверены?';
                    if (!confirm(message)) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                });
            });
        },
    };

    // ==================== УПРАВЛЕНИЕ AJAX-ФОРМАМИ ====================
    
    const AjaxFormManager = {
        init() {
            document.querySelectorAll('form[data-ajax]').forEach(form => {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const submitBtn = form.querySelector('[type="submit"]');
                    const originalText = submitBtn?.textContent;
                    
                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.textContent = 'Отправка...';
                    }
                    
                    try {
                        const formData = new FormData(form);
                        const response = await fetch(form.action, {
                            method: form.method || 'POST',
                            body: formData,
                            headers: {
                                'X-Requested-With': 'XMLHttpRequest',
                            },
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            ToastManager.success(data.message || 'Успешно!');
                            if (form.dataset.ajaxRedirect) {
                                window.location.href = form.dataset.ajaxRedirect;
                            }
                            if (form.dataset.ajaxReset !== 'false') {
                                form.reset();
                            }
                        } else {
                            ToastManager.error(data.error || 'Ошибка');
                        }
                    } catch (error) {
                        ToastManager.error('Ошибка соединения');
                    } finally {
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = originalText;
                        }
                    }
                });
            });
        },
    };

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    
    document.addEventListener('DOMContentLoaded', () => {
        ThemeManager.init();
        AnimationManager.init();
        ToastManager.init();
        ModalManager.init();
        TooltipManager.init();
        TabManager.init();
        SearchManager.init();
        CopyManager.init();
        ConfirmManager.init();
        AjaxFormManager.init();
        
        // Глобальный доступ
        window.ThemeManager = ThemeManager;
        window.ToastManager = ToastManager;
        window.ModalManager = ModalManager;
        
        console.log('Resistance City v5.0.0 — Theme Manager initialized');
    });

})();