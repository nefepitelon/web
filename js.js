// Función para actualizar el progreso visualmente
function updateProgress(language) {
    var progressInput = document.getElementById('progressInput-' + language).value;
    var progressBar = document.getElementById('progressBar-' + language);
    var value = Math.max(0, Math.min(100, progressInput)); // Asegura que el valor esté entre 0 y 100

    progressBar.style.width = value + '%';
    progressBar.setAttribute('aria-valuenow', value);
    progressBar.textContent = value + '%';
}
// Función para actualizar el texto dinámicamente
function updateText(elementId, newValue) {
    var element = document.getElementById(elementId);
    if (element) {
        element.textContent = newValue;
    }
}
// Función para cargar la imagen guardada
function loadSavedImage() {
    var savedImage = localStorage.getItem('profileImage');

    if (savedImage) {
        document.getElementById('profileImage').src = savedImage;
        document.getElementById('profileImage').style.display = 'block';
    }
}

// Función para guardar los casmbios
function saveChanges() {
var progressData = {
    html: document.getElementById('progressInput-html').value,
    css: document.getElementById('progressInput-css').value,
    js: document.getElementById('progressInput-js').value,
    angular: document.getElementById('progressInput-angular').value,
    node: document.getElementById('progressInput-node').value,
    
    /*aboutMe: document.getElementById('about-me-text').textContent,
    experience: document.getElementById('experience-list').innerHTML,
    education: document.getElementById('education-list').innerHTML,
    skills: document.getElementById('skills-list').innerHTML,
    contactEmail: document.getElementById('contact-email').textContent,
    contactPhone: document.getElementById('contact-phone').textContent,
    contactLinkedIn: document.getElementById('contact-linkedin').textContent,
    profileImage: localStorage.getItem('profileImage')*/
};

    // Guardar los valores en el almacenamiento local del navegador solo si está autenticado
    if (isLoggedIn()) {
        localStorage.setItem('progressData', JSON.stringify(progressData));
        console.log('Changes saved:', progressData);
        alert('Los cambios han sido guardados');
    } else {
        alert('Debes iniciar sesión para guardar cambios.');
    }
}

// Función para cargar los valores guardados al iniciar sesión
function loadSavedProgress() {
    var progressData = JSON.parse(localStorage.getItem('progressData'));

    if (progressData) {
        document.getElementById('progressInput-html').value = progressData.html;
        document.getElementById('progressInput-css').value = progressData.css;
        document.getElementById('progressInput-js').value = progressData.js;
        document.getElementById('progressInput-angular').value = progressData.angular;
        document.getElementById('progressInput-node').value = progressData.node;
        
        /*document.getElementById('about-me-text').textContent = progressData.aboutMe;
        document.getElementById('about-me-input').value = progressData.aboutMe;
        document.getElementById('experience-list').innerHTML = progressData.experience;
        document.getElementById('experience-input').value = progressData.experience;
        document.getElementById('education-list').innerHTML = progressData.education;
        document.getElementById('education-input').value = progressData.education;
        document.getElementById('skills-list').innerHTML = progressData.skills;
        document.getElementById('skills-input').value = progressData.skills;
        document.getElementById('contact-email').textContent = progressData.contactEmail;
        document.getElementById('contact-email-input').value = progressData.contactEmail;
        document.getElementById('contact-phone').textContent = progressData.contactPhone;
        document.getElementById('contact-phone-input').value = progressData.contactPhone;
        document.getElementById('contact-linkedin').textContent = progressData.contactLinkedIn;
        document.getElementById('contact-linkedin-input').value = progressData.contactLinkedIn;*/

        // Cargar la imagen guardada
        if (progressData.profileImage) {
            document.getElementById('profileImage').src = progressData.profileImage;
            document.getElementById('profileImage').style.display = 'block';
        }

        // Actualizar visualmente los progresos
        updateProgress('html');
        updateProgress('css');
        updateProgress('js');
        updateProgress('angular');
        updateProgress('node');
    }
}
   // Llamar a la función al cargar la página
   window.onload = function() {
    loadSavedImage();
    loadSavedProgress();
};
// Función para verificar si el usuario está autenticado
function isLoggedIn() {
    // Aquí puedes implementar tu lógica de autenticación, por ejemplo:
    var username = document.getElementById('username').value;
    var password = document.getElementById('password').value;

    return (username === 'brayan' && password === 'ramirez');
}

// Al cargar la página, intentar cargar los valores guardados
document.addEventListener('DOMContentLoaded', function() {
    loadSavedProgress();

    // Ocultar o mostrar botones según el estado de autenticación
    updateButtonVisibility();
});

// Función para actualizar la visibilidad de los botones según el estado de autenticación
function updateButtonVisibility() {
    var saveButton = document.getElementById('saveButton');
    var logoutButton = document.getElementById('logoutButton');

    if (isLoggedIn()) {
        saveButton.classList.remove('hidden');
        logoutButton.classList.remove('hidden');
    } else {
        saveButton.classList.add('hidden');
        logoutButton.classList.add('hidden');
    }
}

// Función para cerrar sesión
function logout() {
    // Ocultar los botones de guardar y cerrar sesión
    document.getElementById('saveButton').classList.add('hidden');
    document.getElementById('logoutButton').classList.add('hidden');

    // Limpiar el formulario de autenticación
    document.getElementById('authForm').reset();
    location.reload(); // Recarga la página para ocultar los botones nuevamente
    alert('Sesión cerrada');
}

// Escuchar cambios en los inputs y actualizar progreso en tiempo real
document.getElementById('progressInput-html').addEventListener('input', function() {
    updateProgress('html');
});
document.getElementById('progressInput-css').addEventListener('input', function() {
    updateProgress('css');
});
document.getElementById('progressInput-js').addEventListener('input', function() {
    updateProgress('js');
});
document.getElementById('progressInput-angular').addEventListener('input', function() {
    updateProgress('angular');
});
document.getElementById('progressInput-node').addEventListener('input', function() {
    updateProgress('node');
});
// Escuchar cambios en los inputs de texto y actualizar el texto correspondiente
document.getElementById('about-me-input').addEventListener('input', function() {
    updateText('about-me-text', this.value);
});
document.getElementById('experience-input').addEventListener('input', function() {
    updateText('experience-list', this.value);
});
document.getElementById('education-input').addEventListener('input', function() {
    updateText('education-list', this.value);
});
document.getElementById('skills-input').addEventListener('input', function() {
    updateText('skills-list', this.value);
});
document.getElementById('contact-email-input').addEventListener('input', function() {
    updateText('contact-email', this.value);
});
document.getElementById('contact-phone-input').addEventListener('input', function() {
    updateText('contact-phone', this.value);
});
document.getElementById('contact-linkedin-input').addEventListener('input', function() {
    updateText('contact-linkedin', this.value);
});



// Evento de submit del formulario de autenticación
document.getElementById('authForm').addEventListener('submit', function(event) {
    event.preventDefault();
    var username = document.getElementById('username').value;
    var password = document.getElementById('password').value;

    if (username === 'brayan' && password === 'ramirez') {
        // Mostrar los controles y botones al iniciar sesión
        document.querySelectorAll('.form-control').forEach(function(element) {
            element.classList.remove('hidden');
        });
        document.getElementById('saveButton').classList.remove('hidden');
        document.getElementById('logoutButton').classList.remove('hidden');

        var modal = bootstrap.Modal.getInstance(document.getElementById('authModal'));
        modal.hide();
    } else {
        alert('Credenciales incorrectas');
    }
});
document.getElementById('imageInput').addEventListener('change', function(event) {
    var file = event.target.files[0];
    var reader = new FileReader();

    reader.onload = function(e) {
        var imageUrl = e.target.result;
        document.getElementById('profileImage').src = imageUrl;
        document.getElementById('profileImage').style.display = 'block';

        // Guardar la URL de la imagen en localStorage
        localStorage.setItem('profileImage', imageUrl);
    };

    if (file) {
        reader.readAsDataURL(file);
    }
});
